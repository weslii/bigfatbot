const database = require('../../config/database');
const logger = require('../../utils/logger');
const RegistrationService = require('../RegistrationService');
const OrderService = require('../OrderService');
const MessageService = require('../MessageService');
const OrderParser = require('../OrderParser');
const { parseOrderWithAI, parseOrderWithAIRetry } = require('../AIPoweredOrderParser');
const NotificationService = require('../NotificationService');
const { isLikelyOrder } = require('../../utils/orderDetection');
const HumanConfirmationService = require('../HumanConfirmationService');

class TelegramMessageHandler {
  constructor(coreService, orderHandler, setupHandler, metricsService) {
    this.core = coreService;
    this.orderHandler = orderHandler;
    this.setupHandler = setupHandler;
    this.metrics = metricsService;
    this.confirmationService = new HumanConfirmationService(coreService);
    
    // Connect the confirmation service to the order service
    // Since OrderService is used statically, we'll need to pass the confirmation service
    // to the OrderService methods that need it
    logger.info('TelegramMessageHandler initialized');
    
    logger.info('TelegramMessageHandler initialized');
    // Message handler will be set up by TelegramService after bot initialization
  }

  async handleMessage(message) {
    const start = Date.now();
    let success = false;
    try {
      // Debug logging
      logger.info('Telegram message received:', {
        messageId: message.message_id,
        chatId: message.chat.id,
        chatType: message.chat.type,
        from: message.from?.username || message.from?.first_name,
        text: message.text?.substring(0, 100) + (message.text?.length > 100 ? '...' : '')
      });

      // Skip messages from bot itself
      if (message.from.is_bot) {
        logger.debug('Skipping message from bot itself');
        return;
      }

      const chatId = message.chat.id;
      const chatType = message.chat.type; // 'private', 'group', 'supergroup', 'channel'
      const sender = message.from;
      
      // Handle setup command FIRST (before checking if group is registered)
      if (message.text && message.text.startsWith('/setup')) {
        logger.info('Setup command detected:', message.text);
        await this.setupHandler.handleSetupCommand(message, chatId, sender);
        success = true;
        return;
      }

      // Handle sales/delivery replies for pending setups
      if (await this.setupHandler.handleSetupReply(message, chatId, sender)) {
        success = true;
        return;
      }

      // Only process group messages (not private messages)
      if (chatType === 'private') {
        logger.info('Ignoring private message from:', sender.username || sender.first_name);
        return;
      }

      // Get group info from database using chat_id as group_id
      const group = await database.query('groups')
        .where('group_id', chatId.toString())
        .first();

      if (!group) {
        logger.info('Message from unknown group:', chatId);
        return;
      }

      if (!group.is_active) {
        logger.info('Message from deactivated group:', chatId);
        return;
      }

      // Check if the user associated with this group is active
      const user = await database.query('users')
        .where('id', group.user_id)
        .select('is_active')
        .first();
      
      if (!user || !user.is_active) {
        logger.info('Message from group with deactivated user:', chatId, 'User ID:', group.user_id);
        return;
      }

      // Get group info from database
      const groupInfo = group;
      
      // Handle sales group messages (new orders)
      if (groupInfo.group_type === 'sales') {
        await this.handleSalesGroupMessage(message, sender, groupInfo);
      }
      
      // Handle delivery group messages (commands and replies)
      else if (groupInfo.group_type === 'delivery') {
        await this.handleDeliveryGroupMessage(message, sender, groupInfo);
      }

      success = true;
    } catch (error) {
      logger.error('Error handling Telegram message:', error);
      
      // Start continuous error notification with group context if available
      try {
        const group = await database.query('groups')
          .where('group_id', message.chat.id.toString())
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
            'Action': 'Process Message',
            'Message From': message.chat.id
          });
        }
      } catch (notificationError) {
        logger.error('Error starting continuous error notification:', notificationError);
      }
    } finally {
      // Update metrics in database
      await this.metrics.updateMetrics({success, responseTime: Date.now() - start, attemptedParsing: false, filteredOut: false});
    }
  }

  async handleSalesGroupMessage(message, sender, groupInfo) {
    const start = Date.now();
    try {
      // Ignore old messages (older than 45 seconds)
      const msgTimestampMs = message.date * 1000; // Convert Unix timestamp to milliseconds
      const msgAgeMs = Date.now() - msgTimestampMs;
      if (msgAgeMs > 45000) {
        logger.info('Ignoring old message (over 45s):', msgTimestampMs, message.text);
        return;
      }

      // Skip if message is from bot itself
      if (sender.is_bot) return;

      const messageText = message.text || '';
      const messageBody = messageText.toLowerCase().trim();
      const senderName = sender.first_name + (sender.last_name ? ' ' + sender.last_name : '');
      const senderUsername = sender.username;

      // Handle item details responses first (more specific)
      if (await this.confirmationService.handleItemDetailsResponse(message, groupInfo.group_id)) {
        return;
      }



      // Handle confirmation responses
      if (await this.confirmationService.handleConfirmationResponse(message, groupInfo.group_id)) {
        return;
      }



      // Handle reply-based cancellation
      if (message.reply_to_message && messageBody === 'cancel') {
        await this.orderHandler.handleReplyCancellation(message, senderName, senderUsername, groupInfo);
        return;
      }

      // Handle commands
      if (messageBody.startsWith('/')) {
        if (messageBody === '/daily') { await this.orderHandler.sendDailyReport(groupInfo); return; }
        else if (messageBody === '/pending') { await this.orderHandler.sendPendingOrders(groupInfo); return; }
        else if (messageBody === '/weekly') { await this.orderHandler.sendWeeklyReport(groupInfo); return; }
        else if (messageBody === '/monthly') { await this.orderHandler.sendMonthlyReport(groupInfo); return; }
        else if (messageBody === '/help') { await this.orderHandler.sendHelpMessage(groupInfo); return; }
        else if (messageBody.startsWith('cancel #')) { const orderId = messageBody.replace('cancel #', '').trim(); await this.orderHandler.cancelOrder(orderId, senderName, senderUsername, groupInfo); return; }
      }

      let orderData = null;
      let attemptedParsing = false;
      let filteredOut = false;
      let errorMessageSent = false; // Track if error message has been sent
      const likelyOrder = isLikelyOrder(messageText);
      logger.debug('[handleSalesGroupMessage] isLikelyOrder:', likelyOrder);
      
      if (likelyOrder) {
        attemptedParsing = true;
        let sentProcessingMsg = false;
        let aiTimedOut = false;
        const aiOrder = await parseOrderWithAIRetry(messageText, {
          maxRetries: 3,
          retryDelayMs: 5000,
          slowThresholdMs: 5000,
          onSlow: async () => {
            if (!sentProcessingMsg) {
              sentProcessingMsg = true;
              await this.core.sendMessage(groupInfo.group_id, '⏳ Processing your order, please wait a moment...');
            }
          }
        });
        
        let parsedWith = null;
        let aiMissingFields = false;
        
        if (aiOrder && !aiOrder.__missingFields) {
          // AI parser succeeded
          if (aiOrder.delivery_date) {
            const parsedDate = OrderParser.parseDate(aiOrder.delivery_date);
            aiOrder.delivery_date = parsedDate.normalized || null;
            aiOrder.delivery_date_raw = parsedDate.raw || null;
          }
          orderData = aiOrder;
          parsedWith = 'AI';
        } else if (aiOrder && aiOrder.__missingFields) {
          // AI parser failed due to missing fields; do not call pattern parser
          aiMissingFields = true;
          orderData = null;
        } else {
          // AI parser failed due to timeout or error; call pattern parser
          aiTimedOut = true;
          orderData = OrderParser.parseOrder(messageText, senderName);
          if (orderData) {
            parsedWith = 'pattern-matching';
          } else if (aiTimedOut) {
            // Only send error if AI timed out and pattern matching also failed
            await this.core.sendMessage(groupInfo.group_id,
              '❌ I could not process that order😕. Please ensure your message is in the correct format:\n' +
              'Name: John Doe\n' +
              'Phone no: 08012345678\n' +
              'Address: 123 Lekki Phase 1, Lagos\n' +
              '2 Cakes, 1 Pizza\n' +
              'To be delivered on the 23rd.'
            );
            errorMessageSent = true;
          }
        }
        
        if (orderData && parsedWith) {
          logger.info(`Order parsed using ${parsedWith} parser`, {
            orderId: orderData.order_id,
            businessId: groupInfo.business_id,
            customerName: orderData.customer_name,
            items: orderData.items
          });
        }
        
        if (attemptedParsing) {
          if (orderData) {
            orderData.business_id = groupInfo.business_id;
            const order = await OrderService.createOrder(groupInfo.business_id, orderData, this.confirmationService);
            
            // Debug: Log the order status
            logger.debug('[handleSalesGroupMessage] Order created with status:', {
              orderId: order.order_id,
              matchingStatus: order.matching_status,
              willSendConfirmations: order.matching_status !== 'needs_clarification'
            });
            
            // Only send confirmations if order doesn't need clarification or confirmation
            if (order.matching_status !== 'needs_clarification' && order.matching_status !== 'needs_confirmation') {
              logger.debug('[handleSalesGroupMessage] Sending confirmation messages via Message Handler path');
              logger.debug('[handleSalesGroupMessage] Order object for confirmation:', {
                orderId: order.order_id,
                matchedItems: order.matched_items,
                matchedItemsType: typeof order.matched_items,
                hasMatchedItems: !!order.matched_items
              });
              const deliveryConfirmation = MessageService.formatOrderConfirmation(order);
              const salesConfirmation = MessageService.formatSalesConfirmation(order);
              const deliveryGroup = await database.query('groups')
                .where('business_id', groupInfo.business_id)
                .where('group_type', 'delivery')
                .first();
              if (deliveryGroup) {
                await this.core.sendMessage(deliveryGroup.group_id, deliveryConfirmation);
              }
              await this.core.sendMessage(groupInfo.group_id, salesConfirmation);
            } else {
              logger.debug('[handleSalesGroupMessage] Skipping confirmation messages - order needs clarification');
            }
            
            logger.debug('[handleSalesGroupMessage] Calling updateMetrics for successful parse', { attemptedParsing, filteredOut, parsedWith });
            await this.metrics.updateMetrics({success: true, responseTime: Date.now() - start, attemptedParsing, filteredOut, parsedWith});
          } else {
            const hasValidPhone = OrderParser.extractPhoneNumbers(messageText).some(num => OrderParser.isValidPhoneNumber(num));
            const addressConfidence = OrderParser.calculatePatternScore(messageText, OrderParser.addressPatterns);
            if ((hasValidPhone && addressConfidence >= 2) && !messageBody.startsWith('/')) {
              if (!errorMessageSent) {
                await this.core.sendMessage(groupInfo.group_id, 
                  '❌ I could not process that order😕. Please ensure your message includes:\n' +
                  '• Customer name\n' +
                  '• Phone number\n' +
                  '• Delivery address\n' +
                  '• Order items\n\n' +
                  'Example format:\n' +
                  'John Doe\n' +
                  '08012345678\n' +
                  '123 Lekki Phase 1, Lagos\n' +
                  '2 Cakes, 1 Pizza'
                );
              }
            }
            logger.debug('[handleSalesGroupMessage] Calling updateMetrics for failed parse', { attemptedParsing, filteredOut, parsedWith: null });
            await this.metrics.updateMetrics({success: false, responseTime: Date.now() - start, attemptedParsing, filteredOut, parsedWith: null});
          }
        }
      } else {
        filteredOut = true;
        logger.debug('[handleSalesGroupMessage] Not a likely order. Calling updateMetrics', { attemptedParsing, filteredOut, parsedWith: null });
        await this.metrics.updateMetrics({success: false, responseTime: Date.now() - start, attemptedParsing, filteredOut, parsedWith: null});
      }
    } catch (error) {
      logger.error('Error handling Telegram sales group message:', error);
    }
  }

  async handleDeliveryGroupMessage(message, sender, groupInfo) {
    const start = Date.now();
    try {
      // Ignore old messages (older than 45 seconds)
      const msgTimestampMs = message.date * 1000; // Convert Unix timestamp to milliseconds
      const msgAgeMs = Date.now() - msgTimestampMs;
      if (msgAgeMs > 45000) {
        logger.info('Ignoring old message (over 45s):', msgTimestampMs, message.text);
        return;
      }
      
      // Skip if message is from bot itself
      if (sender.is_bot) return;

      const messageBody = message.text?.toLowerCase().trim() || '';
      const senderName = sender.first_name + (sender.last_name ? ' ' + sender.last_name : '');
      const senderUsername = sender.username;

      // Handle reply-based completion
      if (message.reply_to_message && messageBody === 'done') {
        await this.orderHandler.handleReplyCompletion(message, senderName, groupInfo);
      }
      // Handle reply-based cancellation
      else if (message.reply_to_message && messageBody === 'cancel') {
        await this.orderHandler.handleReplyCancellation(message, senderName, senderUsername, groupInfo);
      }
      // Handle command-based operations
      else if (messageBody.startsWith('done #')) {
        const orderId = messageBody.replace('done #', '').trim();
        await this.orderHandler.markOrderAsDelivered(orderId, senderName, groupInfo);
      }
      else if (messageBody.startsWith('cancel #')) {
        const orderId = messageBody.replace('cancel #', '').trim();
        await this.orderHandler.cancelOrder(orderId, senderName, senderUsername, groupInfo);
      }
      // Handle report commands
      else if (messageBody === '/daily') {
        await this.orderHandler.sendDailyReport(groupInfo);
      }
      else if (messageBody === '/pending') {
        await this.orderHandler.sendPendingOrders(groupInfo);
      }
      else if (messageBody === '/weekly') {
        await this.orderHandler.sendWeeklyReport(groupInfo);
      }
      else if (messageBody === '/monthly') {
        await this.orderHandler.sendMonthlyReport(groupInfo);
      }
      else if (messageBody === '/help') {
        await this.orderHandler.sendHelpMessage(groupInfo);
      }
    } catch (error) {
      logger.error('Error handling Telegram delivery group message:', error);
    } finally {
      // Update metrics in database
      await this.metrics.updateMetrics({success: true, responseTime: Date.now() - start, attemptedParsing: false, filteredOut: false});
    }
  }


}

module.exports = TelegramMessageHandler; 