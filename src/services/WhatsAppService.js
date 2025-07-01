const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const database = require('../config/database');
const logger = require('../utils/logger');
const RegistrationService = require('./RegistrationService');
const OrderService = require('./OrderService');
const MessageService = require('./MessageService');
const OrderParser = require('./OrderParser');
const ShortCodeGenerator = require('../utils/shortCodeGenerator');

class WhatsAppService {
  static instance = null;

  static getInstance() {
    if (!WhatsAppService.instance) {
      WhatsAppService.instance = new WhatsAppService();
    }
    return WhatsAppService.instance;
  }

  constructor() {
    this.client = null;
    this.isAuthenticated = false;
    this.latestQrDataUrl = null;
    this.pendingSetups = new Map();
    this.isStarting = false;
    this.isStopping = false;
    this.lastMessageTime = Date.now();
    this.messageCount = 0;
    this.maxMessageHistory = 100; // Limit message history
    this.messageHistory = []; // Store recent messages only
    this.cleanupInterval = null;
    
    // Memory optimization
    this.setupMemoryOptimization();

    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--memory-pressure-off',
          '--max_old_space_size=512', // Limit V8 memory
          '--js-flags=--max-old-space-size=512'
        ],
        defaultViewport: {
          width: 800,
          height: 600
        }
      },
      // Memory optimization options
      disableWelcome: true,
      useChrome: false, // Use system Chrome if available
      browserArgs: [
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images',
        '--disable-javascript-harmony-shipping',
        '--disable-background-networking',
          '--disable-default-apps',
          '--disable-sync',
          '--disable-translate',
          '--hide-scrollbars',
        '--mute-audio',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--disable-client-side-phishing-detection',
        '--disable-component-update',
        '--disable-domain-reliability',
        '--disable-features=AudioServiceOutOfProcess',
        '--disable-ipc-flooding-protection',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--memory-pressure-off',
        '--max_old_space_size=512',
        '--js-flags=--max-old-space-size=512'
      ]
    });

    this.client.on('qr', async (qr) => {
      try {
        const qrDataUrl = await qrcode.toDataURL(qr, {
          errorCorrectionLevel: 'H',
          margin: 4,
          scale: 8
        });
        this.latestQrDataUrl = qrDataUrl;
        this.isAuthenticated = false;
        logger.info('=== NEW QR CODE GENERATED ===');
        logger.info('Please scan this QR code using WhatsApp mobile app.');
        logger.info('You have 30 seconds to scan before a new code is generated.');
        logger.info('To view the QR code, copy this URL and open it in a browser:');
        logger.info(qrDataUrl);
        logger.info('================================');
      } catch (error) {
        logger.error('Error generating QR code:', error);
      }
    });

    this.client.on('ready', () => {
      this.isAuthenticated = true;
      this.latestQrDataUrl = null;
      logger.info('WhatsApp client is ready');
    });

    this.client.on('authenticated', () => {
      this.isAuthenticated = true;
      this.latestQrDataUrl = null;
      logger.info('WhatsApp client is authenticated');
    });

    this.client.on('auth_failure', (error) => {
      this.isAuthenticated = false;
      logger.error('WhatsApp authentication failed:', error);
    });

    this.client.on('disconnected', (reason) => {
      this.isAuthenticated = false;
      this.latestQrDataUrl = null;
      logger.warn('WhatsApp client disconnected:', reason);
    });

    this.client.on('message', this.handleMessage.bind(this));
  }

  async start() {
    try {
      await this.client.initialize();
      logger.info('WhatsApp service started successfully');
    } catch (error) {
      logger.error('Failed to start WhatsApp service:', error);
      throw error;
    }
  }

  async stop() {
    try {
      this.isStopping = true;
      logger.info('Stopping WhatsApp service...');

      // Clear cleanup interval
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }

      // Clear message history
      this.messageHistory = [];
      this.pendingSetups.clear();

      // Close client if exists
      if (this.client) {
      await this.client.destroy();
        this.client = null;
      }

      this.isAuthenticated = false;
      this.latestQrDataUrl = null;
      this.isStarting = false;
      this.isStopping = false;

      logger.info('WhatsApp service stopped successfully');
    } catch (error) {
      logger.error('Error stopping WhatsApp service:', error);
    }
  }

  async changeNumber() {
    try {
      logger.info('Logging out current WhatsApp session...');
      await this.client.logout();
      logger.info('Successfully logged out. Restart the bot to use a new number.');
    } catch (error) {
      logger.error('Failed to logout:', error);
      throw error;
    }
  }

  async restart() {
    try {
      logger.info('Restarting WhatsApp service...');
      
      // Check if client is already running
      const isRunning = this.client.pupPage && !this.client.pupPage.isClosed();
      
      if (isRunning) {
        logger.info('Stopping current WhatsApp client...');
        await this.client.destroy();
        logger.info('WhatsApp client stopped successfully');
      }
      
      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Reinitialize the client (LocalAuth will automatically reuse saved session)
      logger.info('Reinitializing WhatsApp client with saved authentication...');
      await this.client.initialize();
      
      // Check authentication status after restart
      const authStatus = await this.checkAuthenticationStatus();
      
      logger.info('WhatsApp service restarted successfully');
      return authStatus;
    } catch (error) {
      logger.error('Failed to restart WhatsApp service:', error);
      throw error;
    }
  }

  async checkAuthenticationStatus() {
    try {
      // Check if client is authenticated
      if (this.client.info && this.client.info.wid) {
        this.isAuthenticated = true;
        this.latestQrDataUrl = null;
        return {
          success: true,
          authenticated: true,
          message: 'WhatsApp bot restarted successfully with existing authentication.',
          phoneNumber: this.client.info.wid.user
        };
      } else {
        this.isAuthenticated = false;
        return {
          success: true,
          authenticated: false,
          message: 'WhatsApp bot restarted but requires authentication. Please use the QR code to authenticate.',
          needsQrCode: true
        };
      }
    } catch (error) {
      logger.error('Error checking authentication status:', error);
      this.isAuthenticated = false;
      return {
        success: false,
        authenticated: false,
        message: 'Failed to check authentication status. Please try again.',
        needsQrCode: true
      };
    }
  }

  async loadMetrics() {
    try {
      let metrics = await database.query('bot_metrics').first();
      if (!metrics) {
        // Create initial metrics record
        const inserted = await database.query('bot_metrics').insert({
          total_messages: 0,
          successful_messages: 0,
          failed_messages: 0,
          response_times: [],
          daily_counts: {},
          last_activity: null
        }).returning('*');
        metrics = inserted[0];
      }
      return metrics;
    } catch (error) {
      logger.error('Error loading bot metrics:', error);
      return null;
    }
  }

  async saveMetrics(metrics) {
    try {
      await database.query('bot_metrics')
        .where('id', metrics.id)
        .update({
          total_messages: metrics.total_messages,
          successful_messages: metrics.successful_messages,
          failed_messages: metrics.failed_messages,
          response_times: metrics.response_times,
          daily_counts: metrics.daily_counts,
          last_activity: metrics.last_activity,
          updated_at: new Date()
        });
    } catch (error) {
      logger.error('Error saving bot metrics:', error);
    }
  }

  async handleMessage(message) {
    const start = Date.now();
    let success = false;
    try {
      const chat = await message.getChat();
      const contact = await message.getContact();
      
      // Handle setup command FIRST (before checking if group is registered)
      if (message.body.startsWith('/setup')) {
        await this.handleSetupCommand(message, chat, contact);
        success = true;
        return;
      }

      // Handle sales/delivery replies for pending setups
      if (await this.handleSetupReply(message, chat, contact)) {
        success = true;
        return;
      }

      // Get group info (only for non-setup messages)
      const group = await database.query('groups')
        .where('group_id', message.from)
        .first();

      if (!group) {
        logger.info('Message from unknown group:', message.from);
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
    } finally {
      // Update metrics in database
      await this.updateMetrics(success, Date.now() - start);
    }
  }

  async updateMetrics(success, responseTime) {
    try {
      const metrics = await this.loadMetrics();
      if (!metrics) return;

      const today = new Date().toISOString().slice(0, 10);
      const dailyCounts = metrics.daily_counts || {};
      dailyCounts[today] = (dailyCounts[today] || 0) + 1;

      let responseTimes = metrics.response_times;
      if (!Array.isArray(responseTimes)) {
        if (typeof responseTimes === 'string') {
          try {
            responseTimes = JSON.parse(responseTimes);
          } catch {
            responseTimes = [];
          }
        } else if (responseTimes == null) {
          responseTimes = [];
        }
      }
      responseTimes.push(responseTime);
      if (responseTimes.length > 100) responseTimes.shift();

      const updatedMetrics = {
        ...metrics,
        total_messages: metrics.total_messages + 1,
        successful_messages: metrics.successful_messages + (success ? 1 : 0),
        failed_messages: metrics.failed_messages + (success ? 0 : 1),
        response_times: responseTimes,
        daily_counts: dailyCounts,
        last_activity: new Date()
      };

      await this.saveMetrics(updatedMetrics);
    } catch (error) {
      logger.error('Error updating metrics:', error);
    }
  }

  async getBotMetrics() {
    try {
      const metrics = await this.loadMetrics();
      if (!metrics) {
        return {
          lastActivity: null,
          messageSuccessRate: 100,
          avgResponseTime: 0,
          dailyMessages: 0
        };
      }

      // Calculate success rate
      const total = metrics.total_messages;
      const successful = metrics.successful_messages;
      const successRate = total > 0 ? (successful / total) * 100 : 100;

      // Average response time (ms)
      let responseTimes = metrics.response_times;
      if (!Array.isArray(responseTimes)) {
        if (typeof responseTimes === 'string') {
          try {
            responseTimes = JSON.parse(responseTimes);
          } catch {
            responseTimes = [];
          }
        } else if (responseTimes == null) {
          responseTimes = [];
        }
      }
      const avgResponse = responseTimes.length > 0 ? 
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;

      // Daily messages (average over last 7 days)
      const dailyCounts = metrics.daily_counts || {};
      const days = Object.keys(dailyCounts).sort().slice(-7);
      const dailyAvg = days.length > 0 ? 
        days.map(d => dailyCounts[d]).reduce((a, b) => a + b, 0) / days.length : 0;

      return {
        lastActivity: metrics.last_activity,
        messageSuccessRate: successRate,
        avgResponseTime: avgResponse,
        dailyMessages: dailyAvg
      };
    } catch (error) {
      logger.error('Error getting bot metrics:', error);
      return {
        lastActivity: null,
        messageSuccessRate: 100,
        avgResponseTime: 0,
        dailyMessages: 0
      };
    }
  }

  async handleSalesGroupMessage(message, contact, groupInfo) {
    try {
      // Skip if message is from bot itself
      if (contact.isMe) return;

      // Debug log for contact object
      logger.info('Contact object:', contact);

      const messageBody = message.body.toLowerCase().trim();
      const senderName = contact.name || contact.pushname || contact.number;
      const senderNumber = contact.number;

      // Handle reply-based cancellation FIRST (before command processing)
      if (message.hasQuotedMsg && messageBody === 'cancel') {
        await this.handleReplyCancellation(message, senderName, senderNumber, groupInfo);
        return;
      }

      // Handle commands in sales group
      if (messageBody.startsWith('/')) {
        // Handle report commands
        if (messageBody === '/daily') {
          await this.sendDailyReport(groupInfo);
          return;
        }
        else if (messageBody === '/pending') {
          await this.sendPendingOrders(groupInfo);
          return;
        }
        else if (messageBody === '/weekly') {
          await this.sendWeeklyReport(groupInfo);
          return;
        }
        else if (messageBody === '/monthly') {
          await this.sendMonthlyReport(groupInfo);
          return;
        }
        else if (messageBody === '/help') {
          await this.sendHelpMessage(groupInfo);
          return;
        }
        // Handle order cancellation in sales group
        else if (messageBody.startsWith('cancel #')) {
          const orderId = messageBody.replace('cancel #', '').trim();
          await this.cancelOrder(orderId, senderName, senderNumber, groupInfo);
          return;
        }
      }

      // Handle regular order parsing
      const orderData = OrderParser.parseOrder(message.body, contact.name || contact.number);
      
      if (orderData) {
        // Add business_id to order data
        orderData.business_id = groupInfo.business_id;
        
        const order = await OrderService.createOrder(groupInfo.business_id, orderData);
        const deliveryConfirmation = MessageService.formatOrderConfirmation(order);
        const salesConfirmation = MessageService.formatSalesConfirmation(order);
        
        // Get delivery group for this business
        const deliveryGroup = await database.query('groups')
          .where('business_id', groupInfo.business_id)
          .where('group_type', 'delivery')
          .first();

        if (deliveryGroup) {
          // Send detailed confirmation to delivery group
          await this.client.sendMessage(deliveryGroup.group_id, deliveryConfirmation);
        }
        
        // Send simplified confirmation to sales group
        await this.client.sendMessage(groupInfo.group_id, salesConfirmation);
        
        logger.info('Order processed and confirmations sent', { 
          orderId: order.id,
          businessId: groupInfo.business_id,
          customerName: orderData.customer_name,
          items: orderData.items
        });
      } else {
        // Enhanced error message for failed parsing
        logger.warn('Order parsing failed', { 
          messageBody: message.body.substring(0, 100) + '...',
          senderName: contact.name || contact.number,
          businessId: groupInfo.business_id 
        });
        
        // Only send error message if message contains BOTH a valid phone number AND high-confidence address
        const hasValidPhone = OrderParser.extractPhoneNumbers(message.body).some(num => OrderParser.isValidPhoneNumber(num));
        const addressConfidence = OrderParser.calculatePatternScore(message.body, OrderParser.addressPatterns);
        if ((hasValidPhone && addressConfidence >= 2) && !message.body.startsWith('/')) {
          await this.client.sendMessage(groupInfo.group_id, 
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
    } catch (error) {
      logger.error('Error handling sales group message:', error);
    }
  }

  async handleDeliveryGroupMessage(message, contact, groupInfo) {
    try {
      // Skip if message is from bot itself
      if (contact.isMe) return;

      // Debug log for contact object
      logger.info('Contact object:', contact);

      const messageBody = message.body.toLowerCase().trim();
      const senderName = contact.name || contact.pushname || contact.number;
      const senderNumber = contact.number;

      // Handle reply-based completion
      if (message.hasQuotedMsg && messageBody === 'done') {
        await this.handleReplyCompletion(message, senderName, groupInfo);
      }
      // Handle reply-based cancellation
      else if (message.hasQuotedMsg && messageBody === 'cancel') {
        await this.handleReplyCancellation(message, senderName, senderNumber, groupInfo);
      }
      // Handle command-based operations
      else if (messageBody.startsWith('done #')) {
        const orderId = messageBody.replace('done #', '').trim();
        await this.markOrderAsDelivered(orderId, senderName, groupInfo);
      }
      else if (messageBody.startsWith('cancel #')) {
        const orderId = messageBody.replace('cancel #', '').trim();
        await this.cancelOrder(orderId, senderName, senderNumber, groupInfo);
      }
      // Handle report commands
      else if (messageBody === '/daily') {
        await this.sendDailyReport(groupInfo);
      }
      else if (messageBody === '/pending') {
        await this.sendPendingOrders(groupInfo);
      }
      else if (messageBody === '/weekly') {
        await this.sendWeeklyReport(groupInfo);
      }
      else if (messageBody === '/monthly') {
        await this.sendMonthlyReport(groupInfo);
      }
      else if (messageBody === '/help') {
        await this.sendHelpMessage(groupInfo);
      }
    } catch (error) {
      logger.error('Error handling delivery group message:', error);
    }
  }

  async handleReplyCompletion(message, senderName, groupInfo) {
    try {
      const quotedMessage = await message.getQuotedMessage();
      
      // Extract order ID using fallback method if the main method fails
      let orderId = null;
      try {
        if (typeof this.extractOrderIdFromMessage === 'function') {
          orderId = this.extractOrderIdFromMessage(quotedMessage.body);
        } else {
          // Fallback extraction method
          orderId = this.fallbackExtractOrderId(quotedMessage.body);
        }
      } catch (extractError) {
        logger.error('Error extracting order ID:', extractError);
        orderId = this.fallbackExtractOrderId(quotedMessage.body);
      }
      
      if (orderId) {
        await this.markOrderAsDelivered(orderId, senderName, groupInfo);
      } else {
        await this.client.sendMessage(groupInfo.group_id, '❌ Could not find order ID in the quoted message. Please try using: done #<order_id>');
      }
    } catch (error) {
      logger.error('Error handling reply completion:', error);
      await this.client.sendMessage(groupInfo.group_id, '❌ Error processing reply. Please try using: done #<order_id>');
    }
  }

  async handleReplyCancellation(message, senderName, senderNumber, groupInfo) {
    try {
      const quotedMessage = await message.getQuotedMessage();
      
      // Extract order ID using fallback method if the main method fails
      let orderId = null;
      try {
        if (typeof this.extractOrderIdFromMessage === 'function') {
          orderId = this.extractOrderIdFromMessage(quotedMessage.body);
        } else {
          // Fallback extraction method
          orderId = this.fallbackExtractOrderId(quotedMessage.body);
        }
      } catch (extractError) {
        logger.error('Error extracting order ID:', extractError);
        orderId = this.fallbackExtractOrderId(quotedMessage.body);
      }
      
      if (orderId) {
        await this.cancelOrder(orderId, senderName, senderNumber, groupInfo);
      } else {
        await this.client.sendMessage(groupInfo.group_id, '❌ Could not find order ID in the quoted message. Please try using: done #<order_id>');
      }
    } catch (error) {
      logger.error('Error handling reply cancellation:', error);
      await this.client.sendMessage(groupInfo.group_id, '❌ Error processing reply. Please try using: done #<order_id>');
    }
  }

  async markOrderAsDelivered(orderId, deliveryPerson, groupInfo) {
    try {
      const order = await OrderService.getOrderById(orderId, groupInfo.business_id);
      
      if (!order) {
        await this.client.sendMessage(groupInfo.group_id, `❌ Order #${orderId} not found.`);
        return;
      }

      if (order.status === 'delivered') {
        await this.client.sendMessage(groupInfo.group_id, `ℹ️ Order #${orderId} is already marked as delivered.`);
        return;
      }

      if (order.status === 'cancelled') {
        await this.client.sendMessage(groupInfo.group_id, `❌ Cannot mark cancelled order #${orderId} as delivered.`);
        return;
      }

      await OrderService.updateOrderStatus(orderId, 'delivered', deliveryPerson, groupInfo.business_id);
      
      // Send delivery confirmation to the group where delivery was marked
      await this.client.sendMessage(groupInfo.group_id, `✅ Order #${orderId} marked as delivered by ${deliveryPerson}.`);
      
      logger.info('Order marked as delivered', { orderId, deliveryPerson, businessId: groupInfo.business_id });
    } catch (error) {
      logger.error('Error marking order as delivered:', error);
      await this.client.sendMessage(groupInfo.group_id, `❌ Error updating order #${orderId}. Please try again.`);
    }
  }

  async cancelOrder(orderId, cancelledBy, cancelledByNumber, groupInfo) {
    try {
      const order = await OrderService.getOrderById(orderId, groupInfo.business_id);
      
      if (!order) {
        await this.client.sendMessage(groupInfo.group_id, `❌ Order #${orderId} not found.`);
        return;
      }

      if (order.status === 'cancelled') {
        await this.client.sendMessage(groupInfo.group_id, `ℹ️ Order #${orderId} is already cancelled.`);
        return;
      }

      if (order.status === 'delivered') {
        await this.client.sendMessage(groupInfo.group_id, `❌ Cannot cancel delivered order #${orderId}.`);
        return;
      }

      await OrderService.updateOrderStatus(orderId, 'cancelled', cancelledBy, groupInfo.business_id);
      
      // Send cancellation notification to the group where cancellation was initiated
      const displayName = cancelledBy || cancelledByNumber;
      await this.client.sendMessage(groupInfo.group_id, `❌ Order #${orderId} cancelled by ${displayName}.`);
      
      // Get both sales and delivery groups for this business
      const businessGroups = await database.query('groups')
        .where('business_id', groupInfo.business_id)
        .whereIn('group_type', ['sales', 'delivery'])
        .select('group_id', 'group_type');
      
      // Send notification to the other group (not the one where cancellation was initiated)
      for (const group of businessGroups) {
        if (group.group_id !== groupInfo.group_id) {
          const groupType = group.group_type === 'sales' ? 'Sales' : 'Delivery';
          await this.client.sendMessage(group.group_id, 
            `❌ *Order Cancelled*\n\n` +
            `*Order ID:* ${orderId}\n` +
            `*Customer:* ${order.customer_name}\n` +
            `*Cancelled by:* ${displayName} (${groupType} Team)\n` +
            `*Items:* ${order.items}`
          );
        }
      }
      
      logger.info('Order cancelled', { orderId, cancelledBy, businessId: groupInfo.business_id });
    } catch (error) {
      logger.error('Error cancelling order:', error);
      await this.client.sendMessage(groupInfo.group_id, `❌ Error cancelling order #${orderId}. Please try again.`);
    }
  }

  async sendHelpMessage(groupInfo) {
    try {
      const message = MessageService.formatHelpMessage();
      await this.client.sendMessage(groupInfo.group_id, message);
    } catch (error) {
      logger.error('Error sending help message:', error);
    }
  }

  async sendDailyReport(groupInfo) {
    try {
      const report = await OrderService.getDailyReport(groupInfo.business_id);
      const message = MessageService.formatDailyReport(report, new Date());
      await this.client.sendMessage(groupInfo.group_id, message);
    } catch (error) {
      logger.error('Error sending daily report:', error);
      await this.client.sendMessage(groupInfo.group_id, '❌ Error generating daily report.');
    }
  }

  async sendPendingOrders(groupInfo) {
    try {
      const orders = await OrderService.getPendingOrders(groupInfo.business_id);
      const message = MessageService.formatPendingOrders(orders);
      await this.client.sendMessage(groupInfo.group_id, message);
    } catch (error) {
      logger.error('Error sending pending orders:', error);
      await this.client.sendMessage(groupInfo.group_id, '❌ Error retrieving pending orders.');
    }
  }

  async sendWeeklyReport(groupInfo) {
    try {
      const report = await OrderService.getWeeklyReport(groupInfo.business_id);
      const message = MessageService.formatWeeklyReport(report);
      await this.client.sendMessage(groupInfo.group_id, message);
    } catch (error) {
      logger.error('Error sending weekly report:', error);
      await this.client.sendMessage(groupInfo.group_id, '❌ Error generating weekly report.');
    }
  }

  async sendMonthlyReport(groupInfo) {
    try {
      const report = await OrderService.getMonthlyReport(groupInfo.business_id);
      const message = MessageService.formatMonthlyReport(report);
      await this.client.sendMessage(groupInfo.group_id, message);
    } catch (error) {
      logger.error('Error sending monthly report:', error);
      await this.client.sendMessage(groupInfo.group_id, '❌ Error generating monthly report.');
    }
  }

  async handleSetupCommand(message, chat, contact) {
    try {
      // Validate chat object
      if (!chat) {
        logger.error('Chat object is undefined in handleSetupCommand');
        return;
      }

      // Validate chat.id and _serialized property
      if (!chat.id || !chat.id._serialized) {
        logger.error('Chat ID or _serialized property is undefined', { 
          chatId: chat.id,
          hasSerialized: chat.id ? !!chat.id._serialized : false
        });
        return;
      }

      const chatId = chat.id._serialized;

      // Only allow setup in groups
      if (!chat.isGroup) {
        await this.client.sendMessage(chatId, '❌ Setup can only be done in WhatsApp groups.');
        return;
      }

      // Parse setup identifier from command
      const parts = message.body.split(' ');
      if (parts.length !== 2) {
        await this.client.sendMessage(chatId, '❌ Invalid setup command. Use: /setup <businessname-CODE>\n\nExample: /setup cakeshop-ABC123');
        return;
      }

      const setupIdentifier = parts[1];
      let business = null;

      // Find business by setup identifier
      business = await ShortCodeGenerator.findBusinessBySetupIdentifier(setupIdentifier);

      if (!business) {
        await this.client.sendMessage(chatId, '❌ Business not found. Please check your setup code.\n\nMake sure you\'re using the correct format: /setup businessname-CODE');
        return;
      }

      // Check if this group is already registered
      const existingGroup = await database.query('groups')
        .where('group_id', chatId)
        .first();

      if (existingGroup) {
        await this.client.sendMessage(chatId, '❌ This group is already registered.');
        return;
      }

      // Check if this business already has both groups
      const groupCount = await database.query('groups')
        .where('business_id', business.business_id)
        .whereNot('group_type', 'main')  // Exclude main groups from count
        .count('* as count')
        .first();

      if (groupCount.count >= 2) {
        await this.client.sendMessage(chatId, '❌ This business already has both groups registered.');
        return;
      }

      // Determine group type based on existing groups
      const existingGroups = await database.query('groups')
        .where('business_id', business.business_id)
        .whereNot('group_type', 'main')  // Exclude main groups from existing groups check
        .select('group_type');

      let groupType;
      if (existingGroups.length === 0) {
        // First group - ask user which type and store pending setup
        await this.client.sendMessage(chatId, 
          `🤖 *Business Setup*\n\nBusiness: ${business.business_name}\n\nIs this a sales group or delivery group?\n\nReply with "sales" or "delivery"`
        );
        
        // Store pending setup for this chat
        this.pendingSetups.set(chatId, {
          business: business,
          timestamp: Date.now()
        });
        
        // Clean up old pending setups (older than 10 minutes)
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        for (const [key, setup] of this.pendingSetups.entries()) {
          if (setup.timestamp < tenMinutesAgo) {
            this.pendingSetups.delete(key);
          }
        }
        
        return;
      } else {
        // Second group - automatically determine type
        const existingType = existingGroups[0].group_type;
        groupType = existingType === 'sales' ? 'delivery' : 'sales';
      }

      // Register the group
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          const insertData = {
              user_id: business.user_id,
            business_id: business.business_id,
              business_name: business.business_name,
              group_name: chat.name,
              group_id: chatId,
              group_type: groupType
          };

          // Only add short code data to the FIRST group (sales OR delivery)
          // This prevents duplicate short codes across groups of the same business
          if (business.setup_identifier && existingGroups.length === 0) {
            // Extract short_code from setup_identifier (format: businessname-CODE)
            const shortCode = business.setup_identifier.split('-').pop();
            insertData.short_code = shortCode;
            // Don't store setup_identifier here - it's already in the main group
          }

          await database.query('groups').insert(insertData);

          // Send confirmation
          await this.client.sendMessage(chatId, 
            `✅ *${groupType === 'sales' ? 'Sales' : 'Delivery'} Group Registered!*\n\n` +
            `*Business:* ${business.business_name}\n` +
            `*Group:* ${chat.name}\n` +
            `*Type:* ${groupType}\n\n` +
            (groupType === 'sales' ? 
              '🛍️ Customers can now place orders in this group.' :
              '🚚 Delivery staff can manage orders in this group.')
          );

          logger.info('Group registered successfully', {
            groupId: chatId,
            groupName: chat.name,
            businessId: business.business_id,
            businessName: business.business_name,
            groupType
          });
          
          return; // Success, exit the retry loop
          
        } catch (error) {
          attempts++;
          
          // If it's a duplicate short code error and we haven't exceeded max attempts, try again with new short code
          if (error.code === '23505' && error.constraint === 'groups_short_code_unique' && attempts < maxAttempts) {
            logger.warn(`Duplicate short code detected in setup, generating new code... (attempt ${attempts}/${maxAttempts})`);
            
            // Generate new short code and setup identifier
            const { shortCode, setupIdentifier } = await ShortCodeGenerator.generateBusinessSetupCode(business.business_name);
            
            // Update the business record with new short code
            await database.query('groups')
              .where('business_id', business.business_id)
              .update({
                short_code: shortCode,
                setup_identifier: setupIdentifier
              });
            
            // Update the business object for next attempt
            business.short_code = shortCode;
            business.setup_identifier = setupIdentifier;
            
            continue;
          }
          
          // For any other error or if we've exceeded attempts, throw the error
          throw error;
        }
      }
    } catch (error) {
      logger.error('Error handling setup command:', error);
      
      // Try to send error message if we have a valid chat ID
      try {
        if (chat && chat.id && chat.id._serialized) {
          await this.client.sendMessage(chat.id._serialized, '❌ Error during setup. Please try again.');
        }
      } catch (sendError) {
        logger.error('Failed to send error message:', sendError);
      }
    }
  }

  async generateGroupSetupQR(userId, businessName) {
    try {
      // Generate a unique setup token
      const setupToken = uuidv4();
      
      // Store setup info in memory (you might want to use Redis or similar in production)
      this.pendingSetups = this.pendingSetups || new Map();
      this.pendingSetups.set(setupToken, {
        userId,
        businessName,
        status: 'pending',
        salesGroupId: null,
        deliveryGroupId: null
      });

      // Generate QR code for the setup token
      const qrCode = await qrcode.toDataURL(setupToken);
      return qrCode;
    } catch (error) {
      logger.error('Error generating setup QR code:', error);
      throw error;
    }
  }

  async handleGroupJoin(groupId, groupName) {
    try {
      // Check if this is a pending setup
      const setup = this.findPendingSetup(groupId);
      if (!setup) {
        logger.info('Group joined but not part of setup:', groupId);
        return;
      }

      // Determine if this is sales or delivery group based on group name
      const isSalesGroup = groupName.toLowerCase().includes('sales');
      const isDeliveryGroup = groupName.toLowerCase().includes('delivery');

      if (!isSalesGroup && !isDeliveryGroup) {
        await this.client.sendMessage(groupId, 
          '⚠️ This group name must include either "sales" or "delivery" to be properly configured.');
        return;
      }

      // Store group ID
      if (isSalesGroup) {
        setup.salesGroupId = groupId;
      } else {
        setup.deliveryGroupId = groupId;
      }

      // Check if both groups are set up
      if (setup.salesGroupId && setup.deliveryGroupId) {
        await this.completeSetup(setup);
      } else {
        await this.client.sendMessage(groupId,
          '✅ Group registered! Please add the other group (sales/delivery) to complete setup.');
      }
    } catch (error) {
      logger.error('Error handling group join:', error);
    }
  }

  findPendingSetup(groupId) {
    if (!this.pendingSetups) return null;
    
    for (const [token, setup] of this.pendingSetups) {
      if (setup.salesGroupId === groupId || setup.deliveryGroupId === groupId) {
        return setup;
      }
    }
    return null;
  }

  async completeSetup(setup) {
    try {
      // Register groups in database
      await RegistrationService.registerGroup(
        setup.userId,
        'Sales Group',
        setup.businessName,
        'sales',
        setup.salesGroupId
      );

      await RegistrationService.registerGroup(
        setup.userId,
        'Delivery Group',
        setup.businessName,
        'delivery',
        setup.deliveryGroupId
      );

      // Send confirmation messages
      const welcomeMessage = `
🤖 *Welcome to WhatsApp Delivery Bot!*

Your business "${setup.businessName}" has been successfully set up.

*Sales Group:* For receiving orders from customers
*Delivery Group:* For managing and tracking deliveries

The bot will now:
• Process orders from the sales group
• Forward them to the delivery group
• Track order status
• Generate daily reports
• Send pending order reminders

For help, type /help in the delivery group.
      `;

      await this.client.sendMessage(setup.salesGroupId, welcomeMessage);
      await this.client.sendMessage(setup.deliveryGroupId, welcomeMessage);

      // Mark setup as complete
      setup.status = 'complete';
      
      logger.info('Group setup completed successfully', {
        businessName: setup.businessName,
        userId: setup.userId
      });
    } catch (error) {
      logger.error('Error completing setup:', error);
      setup.status = 'error';
      setup.error = error.message;
    }
  }

  async getSetupStatus(userId, businessName) {
    if (!this.pendingSetups) return { status: 'not_found' };

    for (const [token, setup] of this.pendingSetups) {
      if (setup.userId === userId && setup.businessName === businessName) {
        return {
          status: setup.status,
          message: setup.error || null
        };
      }
    }

    return { status: 'not_found' };
  }

  async handleSetupReply(message, chat, contact) {
    try {
      const chatId = chat.id._serialized;
      const messageBody = message.body.toLowerCase().trim();
      
      // Check if this is a sales or delivery reply
      if (messageBody !== 'sales' && messageBody !== 'delivery') {
        return false; // Not a setup reply
      }

      // Find pending setup for this chat
      const pendingSetup = this.pendingSetups.get(chatId);
      if (!pendingSetup) {
        return false; // No pending setup for this chat
      }

      const groupType = messageBody; // 'sales' or 'delivery'
      
      // Register the group
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          const insertData = {
            user_id: pendingSetup.business.user_id,
            business_id: pendingSetup.business.business_id,
            business_name: pendingSetup.business.business_name,
            group_name: chat.name,
            group_id: chatId,
            group_type: groupType
          };

          // Only add short code data to the FIRST group
          if (pendingSetup.business.setup_identifier) {
            // Extract short_code from setup_identifier (format: businessname-CODE)
            const shortCode = pendingSetup.business.setup_identifier.split('-').pop();
            insertData.short_code = shortCode;
          }

          await database.query('groups').insert(insertData);

          // Send confirmation
          await this.client.sendMessage(chatId, 
            `✅ *${groupType === 'sales' ? 'Sales' : 'Delivery'} Group Registered!*\n\n` +
            `*Business:* ${pendingSetup.business.business_name}\n` +
            `*Group:* ${chat.name}\n` +
            `*Type:* ${groupType}\n\n` +
            (groupType === 'sales' ? 
              '🛍️ Customers can now place orders in this group.' :
              '🚚 Delivery staff can manage orders in this group.')
          );

          logger.info('Group registered successfully via reply', {
            groupId: chatId,
            groupName: chat.name,
            businessId: pendingSetup.business.business_id,
            businessName: pendingSetup.business.business_name,
            groupType
          });

          // Remove pending setup
          this.pendingSetups.delete(chatId);
          return true; // Handled the reply
          
        } catch (error) {
          attempts++;
          
          // If it's a duplicate short code error and we haven't exceeded max attempts, try again with new short code
          if (error.code === '23505' && error.constraint === 'groups_short_code_unique' && attempts < maxAttempts) {
            logger.warn(`Duplicate short code detected in setup reply, generating new code... (attempt ${attempts}/${maxAttempts})`);
            
            // Generate new short code and setup identifier
            const { shortCode, setupIdentifier } = await ShortCodeGenerator.generateBusinessSetupCode(pendingSetup.business.business_name);
            
            // Update the business record with new short code
            await database.query('groups')
              .where('business_id', pendingSetup.business.business_id)
              .update({
                short_code: shortCode,
                setup_identifier: setupIdentifier
              });
            
            // Update the business object for next attempt
            pendingSetup.business.short_code = shortCode;
            pendingSetup.business.setup_identifier = setupIdentifier;
            
            continue;
          }
          
          // For any other error or if we've exceeded attempts, throw the error
          throw error;
        }
      }
      
      return true; // Handled the reply
    } catch (error) {
      logger.error('Error handling setup reply:', error);
      return false;
    }
  }

  async getBotInfo() {
    try {
      if (!this.client.info) {
        return {
          number: 'Not connected',
          name: 'Bot not ready',
          status: 'disconnected'
        };
      }

      return {
        number: this.client.info.wid.user,
        name: this.client.info.pushname || 'WhatsApp Bot',
        status: 'connected'
      };
    } catch (error) {
      logger.error('Error getting bot info:', error);
      return {
        number: 'Error getting number',
        name: 'WhatsApp Bot',
        status: 'error'
      };
    }
  }

  extractOrderIdFromMessage(messageText) {
    try {
      // Look for order ID pattern: YYYYMMDD-XXX
      const orderIdMatch = messageText.match(/(\d{8}-\d{3})/);
      if (orderIdMatch) {
        return orderIdMatch[1];
      }
      
      // Also look for "Order ID:" pattern
      const orderIdPattern = messageText.match(/Order ID:\s*([^\n]+)/);
      if (orderIdPattern) {
        return orderIdPattern[1].trim();
      }
      
      return null;
    } catch (error) {
      logger.error('Error extracting order ID from message:', error);
      return null;
    }
  }

  fallbackExtractOrderId(messageText) {
    try {
      // Look for order ID pattern: YYYYMMDD-XXX
      const orderIdMatch = messageText.match(/(\d{8}-\d{3})/);
      if (orderIdMatch) {
        return orderIdMatch[1];
      }
      
      // Also look for "Order ID:" pattern
      const orderIdPattern = messageText.match(/Order ID:\s*([^\n]+)/);
      if (orderIdPattern) {
        return orderIdPattern[1].trim();
      }
      
      return null;
    } catch (error) {
      logger.error('Error in fallback order ID extraction:', error);
      return null;
    }
  }

  getLatestQrStatus() {
    return {
      qr: this.latestQrDataUrl,
      authenticated: this.isAuthenticated
    };
  }

  setupMemoryOptimization() {
    // Cleanup old messages every 10 minutes (less frequent)
    this.cleanupInterval = setInterval(() => {
      this.cleanupMessageHistory();
    }, 10 * 60 * 1000);
  }

  cleanupMessageHistory() {
    // Only cleanup if we have too many messages
    if (this.messageHistory.length > this.maxMessageHistory) {
      const toRemove = this.messageHistory.length - this.maxMessageHistory;
      this.messageHistory.splice(0, toRemove);
      logger.info(`Cleaned up ${toRemove} old messages from history`);
    }
    
    // Clear old pending setups (older than 2 hours - more conservative)
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    for (const [token, setup] of this.pendingSetups) {
      if (setup.createdAt && setup.createdAt < twoHoursAgo) {
        this.pendingSetups.delete(token);
        logger.info('Cleaned up old pending setup');
      }
    }
  }

  // Memory optimization method
  async optimizeMemory() {
    try {
      logger.info('Performing WhatsApp service memory optimization...');
      
      // Clear message history (but keep recent messages)
      if (this.messageHistory.length > 50) {
        this.messageHistory = this.messageHistory.slice(-50);
      }
      
      // Clear old pending setups (older than 2 hours)
      const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
      for (const [token, setup] of this.pendingSetups) {
        if (setup.createdAt && setup.createdAt < twoHoursAgo) {
          this.pendingSetups.delete(token);
        }
      }
      
      // DON'T clear browser cache - could cause WhatsApp to log out
      // Only clear if explicitly needed and safe
      
      logger.info('WhatsApp service memory optimization completed');
    } catch (error) {
      logger.error('Error during memory optimization:', error);
    }
  }
}

module.exports = WhatsAppService; 