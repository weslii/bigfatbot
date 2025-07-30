const database = require('../../config/database');
const logger = require('../../utils/logger');
const RegistrationService = require('../RegistrationService');
const OrderService = require('../OrderService');
const MessageService = require('../MessageService');
const OrderParser = require('../OrderParser');
const { parseOrderWithAI, parseOrderWithAIRetry } = require('../AIPoweredOrderParser');
const NotificationService = require('../NotificationService');

class WhatsAppMessageHandler {
  constructor(coreService, orderHandler, setupHandler, metricsService) {
    this.core = coreService;
    this.orderHandler = orderHandler;
    this.setupHandler = setupHandler;
    this.metrics = metricsService;
    this.core.client.on('message', this.handleMessage.bind(this));
  }

  async handleMessage(message) {
    const start = Date.now();
    let success = false;
    try {
      const chat = await message.getChat();
      const contact = await message.getContact();
      
      // Handle setup command FIRST (before checking if group is registered)
      if (message.body.startsWith('/setup')) {
        await this.setupHandler.handleSetupCommand(message, chat, contact);
        success = true;
        return;
      }

      // Handle sales/delivery replies for pending setups
      if (await this.setupHandler.handleSetupReply(message, chat, contact)) {
        success = true;
        return;
      }

      // Get group info (only for non-setup messages)
      const group = await database.query('groups')
        .where('group_id', message.from)
        .first();

      if (!group) {
        // logger.info('Message from unknown group:', message.from);
        return;
      }

      if (!group.is_active) {
        logger.info('Message from deactivated group:', message.from);
        return;
      }

      // Check if the user associated with this group is active
      const user = await database.query('users')
        .where('id', group.user_id)
        .select('is_active')
        .first();
      
      if (!user || !user.is_active) {
        logger.info('Message from group with deactivated user:', message.from, 'User ID:', group.user_id);
        return;
      }

      // Get group info from database
      const groupInfo = group;
      
      // Handle sales group messages (new orders)
      if (groupInfo.group_type === 'sales') {
        await this.handleSalesGroupMessage(message, contact, groupInfo);
      }
      
      // Handle delivery group messages (commands and replies)
      else if (groupInfo.group_type === 'delivery') {
        await this.handleDeliveryGroupMessage(message, contact, groupInfo);
      }

      success = true;
    } catch (error) {
      logger.error('Error handling message:', error);
      
      // Start continuous error notification with group context if available
      try {
        const group = await database.query('groups')
          .where('group_id', message.from)
          .first();
        
        if (group) {
          // For group errors, we'll use a different approach - send immediate notification
          // but don't start continuous notifications for individual message errors
          await NotificationService.notifyGroupError(
            error,
            message.from,
            group.group_name,
            group.business_name
          );
        } else {
          // For system-level message handling errors, start continuous notifications
          NotificationService.startContinuousErrorNotification('service', error, {
            'Component': 'Message Handler',
            'Action': 'Process Message',
            'Message From': message.from
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

  async handleSalesGroupMessage(message, contact, groupInfo) {
    const start = Date.now();
    try {
      // Ignore old messages (older than 45 seconds)
      const msgTimestampMs = message.timestamp > 1e12 ? message.timestamp : message.timestamp * 1000;
      const msgAgeMs = Date.now() - msgTimestampMs;
      if (msgAgeMs > 45000) {
        logger.info('Ignoring old message (over 45s):', msgTimestampMs, message.body);
        return;
      }
      if (contact.isMe) return;
      let messageText;
      if (typeof message.body === 'string') {
        messageText = message.body;
      } else if (Buffer.isBuffer(message.body)) {
        messageText = message.body.toString('utf8');
      } else if (Array.isArray(message.body)) {
        messageText = message.body.join('');
      } else if (typeof message.body === 'object' && message.body !== null) {
        const values = Object.values(message.body);
        if (values.every(v => typeof v === 'string' && v.length === 1)) {
          messageText = values.join('');
        } else if (values.length === 1 && typeof values[0] === 'string') {
          messageText = values[0];
        } else {
          messageText = JSON.stringify(message.body);
        }
      } else {
        messageText = String(message.body);
      }
      const messageBody = messageText.toLowerCase().trim();
      const senderName = contact.name || contact.pushname || contact.number;
      const senderNumber = contact.number;
      if (message.hasQuotedMsg && messageBody === 'cancel') {
        await this.orderHandler.handleReplyCancellation(message, senderName, senderNumber, groupInfo);
        return;
      }
      if (messageBody.startsWith('/')) {
        if (messageBody === '/daily') { await this.orderHandler.sendDailyReport(groupInfo); return; }
        else if (messageBody === '/pending') { await this.orderHandler.sendPendingOrders(groupInfo); return; }
        else if (messageBody === '/weekly') { await this.orderHandler.sendWeeklyReport(groupInfo); return; }
        else if (messageBody === '/monthly') { await this.orderHandler.sendMonthlyReport(groupInfo); return; }
        else if (messageBody === '/help') { await this.orderHandler.sendHelpMessage(groupInfo); return; }
        else if (messageBody.startsWith('cancel #')) { const orderId = messageBody.replace('cancel #', '').trim(); await this.orderHandler.cancelOrder(orderId, senderName, senderNumber, groupInfo); return; }
      }
      let orderData = null;
      let attemptedParsing = false;
      let filteredOut = false;
      let errorMessageSent = false; // Track if error message has been sent
      const likelyOrder = this.isLikelyOrder(messageText);
      logger.info('[handleSalesGroupMessage] isLikelyOrder:', likelyOrder);
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
              await this.core.client.sendMessage(groupInfo.group_id, '⏳ Processing your order, please wait a moment...');
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
          orderData = OrderParser.parseOrder(messageText, contact.name || contact.number);
          if (orderData) {
            parsedWith = 'pattern-matching';
          } else if (aiTimedOut) {
            // Only send error if AI timed out and pattern matching also failed
            await this.core.client.sendMessage(groupInfo.group_id,
              '❌ Could not process order. Please ensure your message is in the correct format:\n' +
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
            const order = await OrderService.createOrder(groupInfo.business_id, orderData);
            const deliveryConfirmation = MessageService.formatOrderConfirmation(order);
            const salesConfirmation = MessageService.formatSalesConfirmation(order);
            const deliveryGroup = await database.query('groups')
              .where('business_id', groupInfo.business_id)
              .where('group_type', 'delivery')
              .first();
            if (deliveryGroup) {
              await this.core.client.sendMessage(deliveryGroup.group_id, deliveryConfirmation);
            }
            await this.core.client.sendMessage(groupInfo.group_id, salesConfirmation);
            logger.info('[handleSalesGroupMessage] Calling updateMetrics for successful parse', { attemptedParsing, filteredOut, parsedWith });
            await this.metrics.updateMetrics({success: true, responseTime: Date.now() - start, attemptedParsing, filteredOut, parsedWith});
          } else {
            const hasValidPhone = OrderParser.extractPhoneNumbers(messageText).some(num => OrderParser.isValidPhoneNumber(num));
            const addressConfidence = OrderParser.calculatePatternScore(messageText, OrderParser.addressPatterns);
            if ((hasValidPhone && addressConfidence >= 2) && !messageBody.startsWith('/')) {
              if (!errorMessageSent) {
                await this.core.client.sendMessage(groupInfo.group_id, 
                  '❌ Could not process order. Please ensure your message includes:\n' +
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
            logger.info('[handleSalesGroupMessage] Calling updateMetrics for failed parse', { attemptedParsing, filteredOut, parsedWith: null });
            await this.metrics.updateMetrics({success: false, responseTime: Date.now() - start, attemptedParsing, filteredOut, parsedWith: null});
          }
        }
      } else {
        filteredOut = true;
        logger.info('[handleSalesGroupMessage] Not a likely order. Calling updateMetrics', { attemptedParsing, filteredOut, parsedWith: null });
        await this.metrics.updateMetrics({success: false, responseTime: Date.now() - start, attemptedParsing, filteredOut, parsedWith: null});
      }
    } catch (error) {
      logger.error('Error handling sales group message:', error);
    }
  }

  async handleDeliveryGroupMessage(message, contact, groupInfo) {
    const start = Date.now();
    try {
      // Ignore old messages (older than 45 seconds)
      const msgTimestampMs = message.timestamp > 1e12 ? message.timestamp : message.timestamp * 1000;
      const msgAgeMs = Date.now() - msgTimestampMs;
      if (msgAgeMs > 45000) {
        logger.info('Ignoring old message (over 45s):', msgTimestampMs, message.body);
        return;
      }
      // Skip if message is from bot itself
      if (contact.isMe) return;

      // Debug log for contact object
      logger.info('Contact object:', contact);

      const messageBody = message.body.toLowerCase().trim();
      const senderName = contact.name || contact.pushname || contact.number;
      const senderNumber = contact.number;

      // Handle reply-based completion
      if (message.hasQuotedMsg && messageBody === 'done') {
        await this.orderHandler.handleReplyCompletion(message, senderName, groupInfo);
      }
      // Handle reply-based cancellation
      else if (message.hasQuotedMsg && messageBody === 'cancel') {
        await this.orderHandler.handleReplyCancellation(message, senderName, senderNumber, groupInfo);
      }
      // Handle command-based operations
      else if (messageBody.startsWith('done #')) {
        const orderId = messageBody.replace('done #', '').trim();
        await this.orderHandler.markOrderAsDelivered(orderId, senderName, groupInfo);
      }
      else if (messageBody.startsWith('cancel #')) {
        const orderId = messageBody.replace('cancel #', '').trim();
        await this.orderHandler.cancelOrder(orderId, senderName, senderNumber, groupInfo);
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
      logger.error('Error handling delivery group message:', error);
    } finally {
      // Update metrics in database
      await this.metrics.updateMetrics({success: true, responseTime: Date.now() - start, attemptedParsing: false, filteredOut: false});
    }
  }

  isLikelyOrder(messageText) {
    try {
      const text = messageText.toLowerCase().trim();
      // New: If message contains 'name', 'phone', and 'address', always treat as likely order
      if (text.includes('name') && text.includes('phone') && text.includes('address')) {
        return true;
      }
      
      // Skip very short messages (likely greetings, thanks, etc.)
      if (text.length < 20) {
        return false;
      }
      
      // Skip messages that are clearly not orders
      const nonOrderPatterns = [
        /^(hi|hello|hey|good morning|good afternoon|good evening|thanks|thank you|ok|okay|yes|no)$/i,
        /^(how are you|how's it going|what's up|sup)$/i,
        /^(bye|goodbye|see you|talk to you later)$/i,
        /^(lol|haha|😊|😄|👍|👋|🙏)$/i,
        /^(test|testing)$/i,
        /^(help|support|assist)$/i,
        // Status inquiry patterns
        /\b(how far|status|update|sent|delivered|shipped|track|tracking|where|when|did you|have you|is it|are you)\b/i,
        // Question patterns about existing orders
        /\b(did you send|did you deliver|have you sent|have you delivered|is it sent|is it delivered|where is|when will|what about)\b/i,
        // General inquiry patterns
        /\b(what about|what happened|what's the|any update|any news|any progress)\b/i
      ];
      
      for (const pattern of nonOrderPatterns) {
        if (pattern.test(text)) {
          return false;
        }
      }
      
      // Look for order indicators
      const orderIndicators = [
        // Phone numbers (Nigerian format) - strong indicator
        /\b(\+?234|0)[789][01]\d{8}\b/,
        /\b\d{11}\b/,
        
        // Customer name patterns (multiple words that could be names) - strong indicator
        /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/,
        
        // Specific order request patterns - strong indicator
        /\b(i want|i need|i would like|please order|can i order|i'd like to order|i want to order|i need to order)\b/i,
        
        // Address indicators - medium indicator
        /\b(address|location|deliver to|send to|house|street|road|avenue|close|drive|way|estate|phase|area|zone)\b/i,
        
        // Specific food items - medium indicator
        /\b(cake|cakes|pizza|food|bread|pastry|pastries|drink|drinks|juice|water|soda)\b/i,
        
        // Quantity indicators - medium indicator
        /\b\d+\s*(piece|pieces|pack|packs|kg|kilos|gram|grams|litre|litres|bottle|bottles|box|boxes|dozen|dozens)\b/i,
        
        // Price indicators - medium indicator
        /\b(price|cost|amount|total|naira|₦|naira|dollar|\$|pound|£)\b/i,
        
        // Delivery date/time - weak indicator
        /\b(deliver|delivery|date|time|when|today|tomorrow|next)\b/i
      ];
      
      // Score order indicators with different weights
      let score = 0;
      
      // Strong indicators (worth 3 points each)
      const strongIndicators = [
        /\b(\+?234|0)[789][01]\d{8}\b/,
        /\b\d{11}\b/,
        /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/,
        /\b(i want|i need|i would like|please order|can i order|i'd like to order|i want to order|i need to order)\b/i
      ];
      
      // Medium indicators (worth 2 points each)
      const mediumIndicators = [
        /\b(address|location|deliver to|send to|house|street|road|avenue|close|drive|way|estate|phase|area|zone)\b/i,
        /\b(cake|cakes|pizza|food|bread|pastry|pastries|drink|drinks|juice|water|soda)\b/i,
        /\b\d+\s*(piece|pieces|pack|packs|kg|kilos|gram|grams|litre|litres|bottle|bottles|box|boxes|dozen|dozens)\b/i,
        /\b(price|cost|amount|total|naira|₦|naira|dollar|\$|pound|£)\b/i
      ];
      
      // Weak indicators (worth 1 point each)
      const weakIndicators = [
        /\b(deliver|delivery|date|time|when|today|tomorrow|next)\b/i
      ];
      
      // Calculate weighted score
      for (const indicator of strongIndicators) {
        if (indicator.test(text)) {
          score += 3;
        }
      }
      
      for (const indicator of mediumIndicators) {
        if (indicator.test(text)) {
          score += 2;
        }
      }
      
      for (const indicator of weakIndicators) {
        if (indicator.test(text)) {
          score += 1;
        }
      }
      
      // Message is likely an order if it has a score of 4 or higher
      // or if it's longer than 80 characters and has a score of 2 or higher
      return score >= 4 || (text.length > 80 && score >= 2);
      
    } catch (error) {
      logger.error('Error in isLikelyOrder check:', error);
      // If there's an error, be conservative and assume it might be an order
      return true;
    }
  }
}

module.exports = WhatsAppMessageHandler; 