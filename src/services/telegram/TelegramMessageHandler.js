const database = require('../../config/database');
const logger = require('../../utils/logger');
const RegistrationService = require('../RegistrationService');
const OrderService = require('../OrderService');
const MessageService = require('../MessageService');
const OrderParser = require('../OrderParser');
const { parseOrderWithAI, parseOrderWithAIRetry } = require('../AIPoweredOrderParser');
const NotificationService = require('../NotificationService');

class TelegramMessageHandler {
  constructor(coreService, orderHandler, setupHandler, metricsService) {
    this.core = coreService;
    this.orderHandler = orderHandler;
    this.setupHandler = setupHandler;
    this.metrics = metricsService;
    
    // Setup message handlers
    this.core.bot.on('message', this.handleMessage.bind(this));
  }

  async handleMessage(message) {
    const start = Date.now();
    let success = false;
    try {
      // Skip messages from bots
      if (message.from.is_bot) {
        return;
      }

      // Handle setup command FIRST (before checking if group is registered)
      if (message.text && message.text.startsWith('/setup')) {
        await this.setupHandler.handleSetupCommand(message, message.chat, message.from);
        success = true;
        return;
      }

      // Handle sales/delivery replies for pending setups
      if (await this.setupHandler.handleSetupReply(message, message.chat, message.from)) {
        success = true;
        return;
      }

      // Get group info (only for non-setup messages)
      const group = await database.query('groups')
        .where('telegram_chat_id', message.chat.id.toString())
        .where('platform', 'telegram')
        .first();

      if (!group) {
        // logger.info('Message from unknown Telegram group:', message.chat.id);
        return;
      }

      if (!group.is_active) {
        logger.info('Message from deactivated Telegram group:', message.chat.id);
        return;
      }

      // Check if the user associated with this group is active
      const user = await database.query('users')
        .where('id', group.user_id)
        .select('is_active')
        .first();
      
      if (!user || !user.is_active) {
        logger.info('Message from Telegram group with deactivated user:', message.chat.id, 'User ID:', group.user_id);
        return;
      }

      // Get group info from database
      const groupInfo = group;
      
      // Handle sales group messages (new orders)
      if (groupInfo.group_type === 'sales') {
        await this.handleSalesGroupMessage(message, message.from, groupInfo);
      }
      
      // Handle delivery group messages (commands and replies)
      else if (groupInfo.group_type === 'delivery') {
        await this.handleDeliveryGroupMessage(message, message.from, groupInfo);
      }

      success = true;
    } catch (error) {
      logger.error('Error handling Telegram message:', error);
      
      // Start continuous error notification with group context if available
      try {
        const group = await database.query('groups')
          .where('telegram_chat_id', message.chat.id.toString())
          .where('platform', 'telegram')
          .first();
        
        if (group) {
          // For group errors, we'll use a different approach - send immediate notification
          // but don't start continuous notifications for individual message errors
          await NotificationService.notifyGroupError(
            error,
            message.chat.id.toString(),
            group.group_name,
            group.business_name
          );
        } else {
          // For system-level message handling errors, start continuous notifications
          NotificationService.startContinuousErrorNotification('service', error, {
            'Component': 'Telegram Message Handler',
            'Action': 'Handle Message',
            'Chat ID': message.chat.id,
            'User ID': message.from.id,
            'Message Text': message.text ? message.text.substring(0, 100) : 'No text'
          });
        }
      } catch (notificationError) {
        logger.error('Error sending Telegram message error notification:', notificationError);
      }
    } finally {
      // Update metrics
      const processingTime = Date.now() - start;
      await this.metrics.updateMetrics({
        messageCount: 1,
        processingTime,
        success: success ? 1 : 0,
        platform: 'telegram'
      });
    }
  }

  async handleSalesGroupMessage(message, contact, groupInfo) {
    try {
      // Skip if message is not text
      if (!message.text) {
        return;
      }

      const messageText = message.text.trim();
      
      // Check if message is likely an order
      if (!this.isLikelyOrder(messageText)) {
        return;
      }

      logger.info('Processing potential order from Telegram sales group:', {
        chatId: message.chat.id,
        messageText: messageText.substring(0, 100),
        businessId: groupInfo.business_id
      });

      // Parse order using AI
      let parsedOrder = null;
      try {
        parsedOrder = await parseOrderWithAIRetry(messageText, {
          maxRetries: 3,
          retryDelayMs: 2000,
          onSlow: (processingTime) => {
            logger.warn(`AI order parsing is slow: ${processingTime}ms`);
          },
          slowThresholdMs: 10000
        });
      } catch (aiError) {
        logger.error('AI parsing failed, falling back to regex:', aiError);
      }

      // If AI parsing failed, try regex parsing
      if (!parsedOrder) {
        try {
          const orderParser = new OrderParser();
          parsedOrder = orderParser.parseOrder(messageText);
        } catch (regexError) {
          logger.error('Regex parsing also failed:', regexError);
        }
      }

      if (!parsedOrder) {
        logger.info('Could not parse order from Telegram message:', messageText.substring(0, 100));
        return;
      }

      // Create order in database
      const orderData = {
        business_id: groupInfo.business_id,
        customer_name: parsedOrder.customer_name,
        customer_phone: parsedOrder.customer_phone,
        customer_address: parsedOrder.address,
        items: parsedOrder.items,
        total_amount: parsedOrder.total || 0,
        notes: parsedOrder.notes,
        source: 'telegram',
        source_message_id: message.message_id,
        source_chat_id: message.chat.id.toString()
      };

      const order = await OrderService.createOrder(orderData);
      
      if (order) {
        logger.info('Order created from Telegram message:', {
          orderId: order.id,
          businessId: groupInfo.business_id,
          customerName: parsedOrder.customer_name
        });

        // Format confirmation messages
        const deliveryConfirmation = MessageService.formatOrderConfirmation(order);
        const salesConfirmation = MessageService.formatSalesConfirmation(order);

        // Find and notify delivery group (same business, delivery type)
        const database = require('../../config/database');
        const deliveryGroup = await database.query('groups')
          .where('business_id', groupInfo.business_id)
          .where('group_type', 'delivery')
          .where('platform', 'telegram')
          .first();

        if (deliveryGroup) {
          try {
            await this.core.sendMessage(deliveryGroup.telegram_chat_id, deliveryConfirmation);
            logger.info('Order forwarded to Telegram delivery group:', {
              orderId: order.id,
              deliveryGroupId: deliveryGroup.telegram_chat_id
            });
          } catch (forwardError) {
            logger.error('Error forwarding order to delivery group:', forwardError);
          }
        } else {
          logger.warn('No Telegram delivery group found for business:', groupInfo.business_id);
        }

        // Send confirmation to sales group
        await this.core.sendMessage(message.chat.id, salesConfirmation);

        // Update metrics
        await this.metrics.updateMetrics({
          ordersCreated: 1,
          platform: 'telegram'
        });
      }
    } catch (error) {
      logger.error('Error handling Telegram sales group message:', error);
      throw error;
    }
  }

  async handleDeliveryGroupMessage(message, contact, groupInfo) {
    try {
      if (!message.text) {
        return;
      }

      const messageText = message.text.trim().toLowerCase();
      const senderName = contact.first_name || contact.username || 'Unknown';
      const senderNumber = contact.id.toString();

      // Handle delivery commands
      if (messageText.startsWith('done') || messageText.startsWith('delivered')) {
        await this.orderHandler.handleReplyCompletion(message, senderName, groupInfo);
        return;
      }

      // Handle cancellation commands
      if (messageText.startsWith('cancel') || messageText.startsWith('cancelled')) {
        await this.orderHandler.handleReplyCancellation(message, senderName, senderNumber, groupInfo);
        return;
      }

      // Handle help command
      if (messageText === 'help' || messageText === '/help') {
        await this.orderHandler.sendHelpMessage(groupInfo);
        return;
      }

      // Handle daily report command
      if (messageText === 'daily' || messageText === '/daily') {
        await this.orderHandler.sendDailyReport(groupInfo);
        return;
      }

      // Handle pending orders command
      if (messageText === 'pending' || messageText === '/pending') {
        await this.orderHandler.sendPendingOrders(groupInfo);
        return;
      }

      // Handle weekly report command
      if (messageText === 'weekly' || messageText === '/weekly') {
        await this.orderHandler.sendWeeklyReport(groupInfo);
        return;
      }

      // Handle monthly report command
      if (messageText === 'monthly' || messageText === '/monthly') {
        await this.orderHandler.sendMonthlyReport(groupInfo);
        return;
      }

    } catch (error) {
      logger.error('Error handling Telegram delivery group message:', error);
      throw error;
    }
  }

  isLikelyOrder(messageText) {
    // Similar logic to WhatsApp but adapted for Telegram
    const orderKeywords = [
      'order', 'buy', 'purchase', 'deliver', 'delivery', 'want', 'need',
      'please', 'can i', 'i would like', 'i want', 'send me', 'bring me'
    ];

    const lowerText = messageText.toLowerCase();
    
    // Check for order keywords
    const hasOrderKeyword = orderKeywords.some(keyword => 
      lowerText.includes(keyword)
    );

    // Check for phone number pattern
    const phonePattern = /(\+?\d{1,4}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
    const hasPhoneNumber = phonePattern.test(messageText);

    // Check for address indicators
    const addressKeywords = ['address', 'location', 'street', 'avenue', 'road', 'drive'];
    const hasAddress = addressKeywords.some(keyword => lowerText.includes(keyword));

    // Check for item indicators
    const itemKeywords = ['pizza', 'burger', 'food', 'meal', 'dish', 'item', 'product'];
    const hasItems = itemKeywords.some(keyword => lowerText.includes(keyword));

    return hasOrderKeyword && (hasPhoneNumber || hasAddress || hasItems);
  }
}

module.exports = TelegramMessageHandler; 