const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const database = require('../config/database');
const logger = require('../utils/logger');
const RegistrationService = require('./RegistrationService');
const OrderService = require('./OrderService');
const MessageService = require('./MessageService');
const OrderParser = require('./OrderParser');
const { parseOrderWithAI, parseOrderWithAIRetry } = require('./AIPoweredOrderParser');
const ShortCodeGenerator = require('../utils/shortCodeGenerator');
const NotificationService = require('./NotificationService');

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

    this.client.on('ready', async () => {
      logger.info('=== CLIENT READY EVENT FIRED ===');
      this.isAuthenticated = true;
      this.latestQrDataUrl = null;
      logger.info('WhatsApp client is ready');
      logger.info('isAuthenticated set to:', this.isAuthenticated);
      
      // Store connection status in database for cross-process access
      await this.storeConnectionStatus('connected', this.client.info?.wid?.user);
      
      // Send connection restored notification
      try {
        await NotificationService.notifyConnectionRestored({
          'Reconnection Time': '2.5 seconds',
          'Previous Status': 'Disconnected'
        });
      } catch (notificationError) {
        logger.error('Error sending connection restored notification:', notificationError);
      }
    });

    this.client.on('authenticated', () => {
      logger.info('=== CLIENT AUTHENTICATED EVENT FIRED ===');
      this.isAuthenticated = true;
      this.latestQrDataUrl = null;
      logger.info('WhatsApp client is authenticated');
      logger.info('isAuthenticated set to:', this.isAuthenticated);
      
      // Store connection status in database for cross-process access
      this.storeConnectionStatus('authenticated', this.client.info?.wid?.user);
    });

    this.client.on('auth_failure', async (error) => {
      logger.info('=== CLIENT AUTH FAILURE EVENT FIRED ===');
      this.isAuthenticated = false;
      logger.error('WhatsApp authentication failed:', error);
      logger.info('isAuthenticated set to:', this.isAuthenticated);
      
      // Store connection status in database for cross-process access
      await this.storeConnectionStatus('auth_failure', null);
      
      // Start continuous authentication error notifications
      try {
        const authError = new Error(`WhatsApp authentication failed: ${error.message || error}`);
        NotificationService.startContinuousErrorNotification('connection', authError, {
          'Error Type': 'Authentication Failure',
          'Failure Time': new Date().toISOString()
        });
      } catch (notificationError) {
        logger.error('Error starting continuous authentication error notification:', notificationError);
      }
    });

    this.client.on('disconnected', async (reason) => {
      logger.info('=== CLIENT DISCONNECTED EVENT FIRED ===');
      this.isAuthenticated = false;
      this.latestQrDataUrl = null;
      logger.warn('WhatsApp client disconnected:', reason);
      logger.info('isAuthenticated set to:', this.isAuthenticated);
      
      // Store connection status in database for cross-process access
      await this.storeConnectionStatus('disconnected', null);
      
      // Start continuous connection error notifications
      try {
        const disconnectError = new Error(`WhatsApp disconnected: ${reason}`);
        NotificationService.startContinuousErrorNotification('connection', disconnectError, {
          'Disconnect Reason': reason,
          'Last Connected': new Date().toISOString()
        });
      } catch (notificationError) {
        logger.error('Error starting continuous connection error notification:', notificationError);
      }
    });

    this.client.on('message', this.handleMessage.bind(this));
  }

  async start() {
    try {
      // Store initial connecting status
      await this.storeConnectionStatus('connecting', null);
      
      await this.client.initialize();
      logger.info('WhatsApp service started successfully');
      
      // Send service restart notification
      try {
        await NotificationService.notifyServiceRestart('WhatsApp Service', {
          'Start Time': new Date().toISOString(),
          'Status': 'Running'
        });
      } catch (notificationError) {
        logger.error('Error sending service start notification:', notificationError);
      }
    } catch (error) {
      logger.error('Failed to start WhatsApp service:', error);
      // Store error status
      await this.storeConnectionStatus('error', null);
      
      // Start continuous service error notifications
      try {
        NotificationService.startContinuousErrorNotification('service', error, {
          'Component': 'WhatsApp Service',
          'Action': 'Startup',
          'Error Type': 'Service Startup Failure'
        });
      } catch (notificationError) {
        logger.error('Error starting continuous service error notification:', notificationError);
      }
      
      throw error;
    }
  }

  async stop() {
    try {
      this.isStopping = true;
      logger.info('Stopping WhatsApp service...');

      // Store stopping status
      await this.storeConnectionStatus('stopping', null);

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

      // Store stopped status
      await this.storeConnectionStatus('disconnected', null);

      logger.info('WhatsApp service stopped successfully');
      
      // Stop all continuous error notifications when service is properly stopped
      NotificationService.stopAllContinuousErrorNotifications();
      
      // Send service stop notification
      await NotificationService.notifyServiceRestart('WhatsApp Service', {
        'Stop Time': new Date().toISOString(),
        'Status': 'Stopped',
        'Reason': 'Manual stop'
      });
    } catch (error) {
      logger.error('Error stopping WhatsApp service:', error);
      // Store error status
      await this.storeConnectionStatus('error', null);
      
      // Start continuous service error notifications
      try {
        NotificationService.startContinuousErrorNotification('service', error, {
          'Component': 'WhatsApp Service',
          'Action': 'Stop',
          'Error Type': 'Service Stop Failure'
        });
      } catch (notificationError) {
        logger.error('Error starting continuous service error notification:', notificationError);
      }
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
      // First check if client exists
      if (!this.client) {
        logger.info('Authentication check: Client not initialized');
        this.isAuthenticated = false;
        return {
          success: true,
          authenticated: false,
          message: 'WhatsApp client not initialized.',
          needsQrCode: true
        };
      }

      // Check if client is authenticated using both flags
      if (this.isAuthenticated && this.client.info && this.client.info.wid) {
        logger.info('Authentication check: Client is authenticated', {
          phoneNumber: this.client.info.wid.user,
          name: this.client.info.pushname
        });
        return {
          success: true,
          authenticated: true,
          message: 'WhatsApp bot is authenticated and connected.',
          phoneNumber: this.client.info.wid.user
        };
      } else if (this.isAuthenticated && (!this.client.info || !this.client.info.wid)) {
        logger.info('Authentication check: Authenticated but client info not available yet');
        return {
          success: true,
          authenticated: true,
          message: 'WhatsApp bot is authenticated but still connecting.',
          phoneNumber: 'Connecting...'
        };
      } else {
        logger.info('Authentication check: Not authenticated');
        this.isAuthenticated = false;
        return {
          success: true,
          authenticated: false,
          message: 'WhatsApp bot requires authentication. Please use the QR code to authenticate.',
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
      let metrics = await database.query('bot_metrics').select('*').first();
      if (!metrics) {
        // Create initial metrics record
        const inserted = await database.query('bot_metrics').insert({
          total_messages: 0,
          successful_messages: 0,
          failed_messages: 0,
          response_times: JSON.stringify([]),
          daily_counts: JSON.stringify({}),
          last_activity: null
        }).returning('*');
        metrics = inserted[0];
      }
      // Parse JSON fields if they come as strings
      if (typeof metrics.response_times === 'string') {
        try {
          metrics.response_times = JSON.parse(metrics.response_times);
        } catch {
          metrics.response_times = [];
        }
      }
      if (typeof metrics.daily_counts === 'string') {
        try {
          metrics.daily_counts = JSON.parse(metrics.daily_counts);
        } catch {
          metrics.daily_counts = {};
        }
      }
      return metrics;
    } catch (error) {
      logger.error('Error loading bot metrics:', error);
      return null;
    }
  }

  async saveMetrics(metrics) {
    try {
      // logger.info('[saveMetrics] saving metrics:', metrics);
      // Ensure response_times is a valid array and serialize it properly
      let responseTimes = metrics.response_times;
      if (!Array.isArray(responseTimes)) {
        responseTimes = [];
      }
      // Ensure daily_counts is a valid object
      let dailyCounts = metrics.daily_counts;
      if (typeof dailyCounts !== 'object' || dailyCounts === null) {
        dailyCounts = {};
      }
      // Validate and clean the data before saving
      const cleanMetrics = {
        total_messages: parseInt(metrics.total_messages) || 0,
        successful_messages: parseInt(metrics.successful_messages) || 0,
        failed_messages: parseInt(metrics.failed_messages) || 0,
        response_times: JSON.stringify(responseTimes),
        daily_counts: JSON.stringify(dailyCounts),
        last_activity: metrics.last_activity || new Date(),
        updated_at: new Date(),
        parsing_attempts: parseInt(metrics.parsing_attempts) || 0,
        parsing_successes: parseInt(metrics.parsing_successes) || 0,
        parsing_failures: parseInt(metrics.parsing_failures) || 0,
        filtered_messages: parseInt(metrics.filtered_messages) || 0,
        ai_parsed_orders: parseInt(metrics.ai_parsed_orders) || 0,
        pattern_parsed_orders: parseInt(metrics.pattern_parsed_orders) || 0
      };
      // logger.info('[saveMetrics] cleanMetrics to update:', cleanMetrics);
      if (!metrics.id) {
        // logger.warn('[saveMetrics] No metrics.id found when saving metrics. Attempting fallback update.');
        // Fallback: update the first row if only one exists
        const allRows = await database.query('bot_metrics').select('id');
        // logger.info('[saveMetrics] allRows:', allRows);
        if (allRows.length === 1) {
          // logger.info('[saveMetrics] Updating row with id:', allRows[0].id);
          await database.query('bot_metrics').where('id', allRows[0].id).update(cleanMetrics);
        } else {
          // logger.error('[saveMetrics] Could not update bot_metrics: no id and multiple rows exist.');
        }
      } else {
        // logger.info('[saveMetrics] Updating row with id:', metrics.id);
        await database.query('bot_metrics').where('id', metrics.id).update(cleanMetrics);
      }
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
      await this.updateMetrics({success, responseTime: Date.now() - start, attemptedParsing: false, filteredOut: false});
    }
  }

  async updateMetrics({success, responseTime, attemptedParsing, filteredOut, parsedWith}) {
    try {
      const metrics = await this.loadMetrics();
      if (!metrics) return;

      // ---
      // DAILY MESSAGE COUNTING FOR ADMIN DASHBOARD:
      // Each time a message is processed, increment the count for today's date in metrics.daily_counts.
      // This is used to display the 'Daily Messages' metric in the admin dashboard.
      // ---

      const today = new Date().toISOString().slice(0, 10);
      const dailyCounts = metrics.daily_counts || {};
      dailyCounts[today] = (dailyCounts[today] || 0) + 1;

      let responseTimes = metrics.response_times;
      if (!Array.isArray(responseTimes)) {
        if (typeof responseTimes === 'string') {
          try { responseTimes = JSON.parse(responseTimes); } catch { responseTimes = []; }
        } else if (responseTimes && typeof responseTimes === 'object') {
          try { responseTimes = Object.values(responseTimes); } catch { responseTimes = []; }
        } else { responseTimes = []; }
      }
      if (!Array.isArray(responseTimes)) responseTimes = [];
      responseTimes.push(responseTime);
      if (responseTimes.length > 100) responseTimes.shift();

      // New metrics for parsing performance
      const parsing_attempts = (metrics.parsing_attempts || 0) + (attemptedParsing ? 1 : 0);
      const parsing_successes = (metrics.parsing_successes || 0) + (attemptedParsing && success ? 1 : 0);
      const parsing_failures = (metrics.parsing_failures || 0) + (attemptedParsing && !success ? 1 : 0);
      const filtered_messages = (metrics.filtered_messages || 0) + (filteredOut ? 1 : 0);
      // New: Track AI and pattern-matching parsed orders
      const ai_parsed_orders = (metrics.ai_parsed_orders || 0) + (parsedWith === 'AI' ? 1 : 0);
      const pattern_parsed_orders = (metrics.pattern_parsed_orders || 0) + (parsedWith === 'pattern-matching' ? 1 : 0);

      // Update per-day parsing metrics in parsing_metrics_by_day
      let parsingMetricsByDay = metrics.parsing_metrics_by_day;
      if (typeof parsingMetricsByDay === 'string') {
        try { parsingMetricsByDay = JSON.parse(parsingMetricsByDay); } catch { parsingMetricsByDay = {}; }
      }
      if (!parsingMetricsByDay || typeof parsingMetricsByDay !== 'object') parsingMetricsByDay = {};
      if (!parsingMetricsByDay[today]) parsingMetricsByDay[today] = { attempts: 0, successes: 0, failures: 0 };
      if (attemptedParsing) {
        parsingMetricsByDay[today].attempts += 1;
        if (success) parsingMetricsByDay[today].successes += 1;
        else parsingMetricsByDay[today].failures += 1;
      }

      const updatedMetrics = {
        ...metrics,
        total_messages: (metrics.total_messages || 0) + 1,
        successful_messages: (metrics.successful_messages || 0) + (success ? 1 : 0),
        failed_messages: (metrics.failed_messages || 0) + (success ? 0 : 1),
        response_times: responseTimes,
        daily_counts: dailyCounts,
        last_activity: new Date(),
        parsing_attempts,
        parsing_successes,
        parsing_failures,
        filtered_messages,
        ai_parsed_orders,
        pattern_parsed_orders,
        parsing_metrics_by_day: parsingMetricsByDay
      };
      await this.saveMetrics(updatedMetrics);
    } catch (error) {
      logger.error('Error updating metrics:', error);
    }
  }

  // This method provides bot statistics for the admin dashboard, including daily messages, response time, and parsing rates.
  async getBotMetrics() {
    try {
      const metrics = await this.loadMetrics();
      if (!metrics) {
        return {
          lastActivity: null,
          messageSuccessRate: 100,
          avgResponseTime: 0,
          dailyMessages: 0,
          parsingSuccessRate: 100,
          parsingAttempts: 0,
          filteredMessages: 0
        };
      }
      // Calculate parsing success rate based on parsing attempts
      const attempts = metrics.parsing_attempts || 0;
      const successes = metrics.parsing_successes || 0;
      const parsingSuccessRate = attempts > 0 ? (successes / attempts) * 100 : 100;
      // Average response time (ms)
      let responseTimes = metrics.response_times;
      if (!Array.isArray(responseTimes)) {
        if (typeof responseTimes === 'string') {
          try { responseTimes = JSON.parse(responseTimes); } catch { responseTimes = []; }
        } else if (responseTimes && typeof responseTimes === 'object') {
          try { responseTimes = Object.values(responseTimes); } catch { responseTimes = []; }
        } else { responseTimes = []; }
      }
      if (!Array.isArray(responseTimes)) responseTimes = [];
      const avgResponse = responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;
      // Daily messages (average over last 7 days)
      const dailyCounts = metrics.daily_counts || {};
      const days = Object.keys(dailyCounts).sort().slice(-7);
      const dailyAvg = days.length > 0 ? days.map(d => dailyCounts[d]).reduce((a, b) => a + b, 0) / days.length : 0;
      return {
        lastActivity: metrics.last_activity,
        messageSuccessRate: (metrics.total_messages ? (metrics.successful_messages / metrics.total_messages) * 100 : 100),
        avgResponseTime: avgResponse,
        dailyMessages: dailyAvg,
        parsingSuccessRate,
        parsingAttempts: attempts,
        filteredMessages: metrics.filtered_messages || 0
      };
    } catch (error) {
      logger.error('Error getting bot metrics:', error);
      return {
        lastActivity: null,
        messageSuccessRate: 100,
        avgResponseTime: 0,
        dailyMessages: 0,
        parsingSuccessRate: 100,
        parsingAttempts: 0,
        filteredMessages: 0
      };
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
        await this.handleReplyCancellation(message, senderName, senderNumber, groupInfo);
        return;
      }
      if (messageBody.startsWith('/')) {
        if (messageBody === '/daily') { await this.sendDailyReport(groupInfo); return; }
        else if (messageBody === '/pending') { await this.sendPendingOrders(groupInfo); return; }
        else if (messageBody === '/weekly') { await this.sendWeeklyReport(groupInfo); return; }
        else if (messageBody === '/monthly') { await this.sendMonthlyReport(groupInfo); return; }
        else if (messageBody === '/help') { await this.sendHelpMessage(groupInfo); return; }
        else if (messageBody.startsWith('cancel #')) { const orderId = messageBody.replace('cancel #', '').trim(); await this.cancelOrder(orderId, senderName, senderNumber, groupInfo); return; }
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
              await this.client.sendMessage(groupInfo.group_id, '⏳ Processing your order, please wait a moment...');
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
            await this.client.sendMessage(groupInfo.group_id,
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
              await this.client.sendMessage(deliveryGroup.group_id, deliveryConfirmation);
            }
            await this.client.sendMessage(groupInfo.group_id, salesConfirmation);
            logger.info('[handleSalesGroupMessage] Calling updateMetrics for successful parse', { attemptedParsing, filteredOut, parsedWith });
            await this.updateMetrics({success: true, responseTime: Date.now() - start, attemptedParsing, filteredOut, parsedWith});
          } else {
            const hasValidPhone = OrderParser.extractPhoneNumbers(messageText).some(num => OrderParser.isValidPhoneNumber(num));
            const addressConfidence = OrderParser.calculatePatternScore(messageText, OrderParser.addressPatterns);
            if ((hasValidPhone && addressConfidence >= 2) && !messageBody.startsWith('/')) {
              if (!errorMessageSent) {
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
            logger.info('[handleSalesGroupMessage] Calling updateMetrics for failed parse', { attemptedParsing, filteredOut, parsedWith: null });
            await this.updateMetrics({success: false, responseTime: Date.now() - start, attemptedParsing, filteredOut, parsedWith: null});
          }
        }
      } else {
        filteredOut = true;
        logger.info('[handleSalesGroupMessage] Not a likely order. Calling updateMetrics', { attemptedParsing, filteredOut, parsedWith: null });
        await this.updateMetrics({success: false, responseTime: Date.now() - start, attemptedParsing, filteredOut, parsedWith: null});
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
    } finally {
      // Update metrics in database
      await this.updateMetrics({success: true, responseTime: Date.now() - start, attemptedParsing: false, filteredOut: false});
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
      // Debug log for order lookup
      logger.info(`[markOrderAsDelivered] Looking up order`, { orderId, businessId: groupInfo.business_id });
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
      // Debug log for order lookup
      logger.info(`[cancelOrder] Looking up order`, { orderId, businessId: groupInfo.business_id });
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

*Sales Group:* For receiving orders from the sales group
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

      // Get user data for notification
      const user = await database.query('users').where('id', setup.userId).first();
      
      // Send business registration notification
      if (user) {
        const businessData = {
          business_name: setup.businessName,
          business_id: setup.businessId || setup.business?.business_id || 'auto-generated',
          group_id: setup.salesGroupId,
          group_type: 'sales'
        };
        
        try {
          await NotificationService.notifyBusinessRegistration(businessData, user, {
            'Registration Method': 'WhatsApp Setup',
            'Setup Duration': '2.5 minutes',
            'Groups Created': '2 (Sales + Delivery)'
          });
        } catch (notificationError) {
          logger.error('Error sending business registration notification:', notificationError);
        }
      }
    } catch (error) {
      logger.error('Error completing setup:', error);
      setup.status = 'error';
      setup.error = error.message;
      
      // Start continuous setup error notifications
      try {
        NotificationService.startContinuousErrorNotification('service', error, {
          'Component': 'Business Setup',
          'Action': 'Complete Setup',
          'Business Name': setup.businessName,
          'User ID': setup.userId
        });
      } catch (notificationError) {
        logger.error('Error starting continuous setup error notification:', notificationError);
      }
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
      logger.info('=== getBotInfo() called ===');
      
      // Get connection status from database (works across processes)
      const connectionStatus = await this.getConnectionStatus();
      logger.info('Database connection status:', connectionStatus);
      
      // Format phone number to remove 234 prefix
      const formatPhoneNumber = (phoneNumber) => {
        if (!phoneNumber) return null;
        // Remove 234 prefix and add 0
        if (phoneNumber.startsWith('234')) {
          return '0' + phoneNumber.substring(3);
        }
        return phoneNumber;
      };
      
      // Map database status to bot info
      switch (connectionStatus.status) {
        case 'connected':
        case 'authenticated':
          return {
            number: formatPhoneNumber(connectionStatus.phoneNumber) || 'Connected',
            name: 'WhatsApp Bot',
            status: 'connected'
          };
        case 'connecting':
          return {
            number: 'Connecting...',
            name: 'Bot connecting',
            status: 'connecting'
          };
        case 'stopping':
          return {
            number: 'Stopping...',
            name: 'Bot stopping',
            status: 'stopping'
          };
        case 'auth_failure':
          return {
            number: 'Authentication failed',
            name: 'Bot authentication failed',
            status: 'auth_failure'
          };
        case 'error':
          return {
            number: 'Error occurred',
            name: 'Bot error',
            status: 'error'
          };
        case 'disconnected':
          return {
            number: 'Disconnected',
            name: 'Bot disconnected',
            status: 'disconnected'
          };
        case 'unknown':
        default:
        return {
          number: 'Not connected',
          name: 'Bot not ready',
          status: 'disconnected'
        };
      }
    } catch (error) {
      logger.error('Error getting bot info:', error);
      return {
        number: 'Error getting number',
        name: 'WhatsApp Bot',
        status: 'error'
      };
    }
  }

  async refreshAuthenticationStatus() {
    try {
      logger.info('=== refreshAuthenticationStatus() called ===');
      logger.info('Client exists:', !!this.client);
      logger.info('Client info exists:', !!(this.client && this.client.info));
      logger.info('Client info details:', this.client && this.client.info ? {
        hasWid: !!this.client.info.wid,
        widUser: this.client.info.wid?.user,
        pushname: this.client.info.pushname
      } : 'No client info');
      
      // Check if client exists and has info
      if (this.client && this.client.info && this.client.info.wid) {
        this.isAuthenticated = true;
        logger.info('Authentication status refreshed: Authenticated', {
          phoneNumber: this.client.info.wid.user
        });
      } else if (this.client && !this.client.info) {
        // Client exists but no info yet - might be connecting
        logger.info('Authentication status refreshed: Client connecting');
      } else {
        // No client or client not ready
        this.isAuthenticated = false;
        logger.info('Authentication status refreshed: Not authenticated');
      }
    } catch (error) {
      logger.error('Error refreshing authentication status:', error);
      this.isAuthenticated = false;
    }
  }

  async forceCheckAuthentication() {
    try {
      logger.info('=== forceCheckAuthentication() called ===');
      
      if (!this.client) {
        logger.info('No client available');
        return false;
      }

      // Try to get client info directly
      try {
        const info = this.client.info;
        logger.info('Direct client.info check:', info);
        
        if (info && info.wid && info.wid.user) {
          this.isAuthenticated = true;
          logger.info('Force check: Client is authenticated', {
            phoneNumber: info.wid.user,
            name: info.pushname
          });
          return true;
        }
      } catch (infoError) {
        logger.error('Error getting client.info:', infoError);
      }

      // Try to check if client is ready
      try {
        const isReady = this.client.pupPage && !this.client.pupPage.isClosed();
        logger.info('Client page ready check:', isReady);
        
        if (isReady) {
          // If page is ready but no info, might still be connecting
          logger.info('Force check: Client page is ready but no info yet');
          return false;
        }
      } catch (readyError) {
        logger.error('Error checking client readiness:', readyError);
      }

      this.isAuthenticated = false;
      logger.info('Force check: Client not authenticated');
      return false;
    } catch (error) {
      logger.error('Error in forceCheckAuthentication:', error);
      this.isAuthenticated = false;
      return false;
    }
  }

  extractOrderIdFromMessage(messageText) {
    try {
      // Look for new order ID pattern: XXX-YYYYMMDD-XXX (where XXX is alphanumeric)
      const orderIdMatch = messageText.match(/([A-Z0-9]{3}-\d{8}-\d{3})/);
      if (orderIdMatch) {
        return orderIdMatch[1];
      }
      // Fallback: old pattern (just in case)
      const oldOrderIdMatch = messageText.match(/(\d{8}-\d{3})/);
      if (oldOrderIdMatch) {
        return oldOrderIdMatch[1];
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
      // Look for new order ID pattern: XXX-YYYYMMDD-XXX (where XXX is alphanumeric)
      const orderIdMatch = messageText.match(/([A-Z0-9]{3}-\d{8}-\d{3})/);
      if (orderIdMatch) {
        return orderIdMatch[1];
      }
      // Fallback: old pattern (just in case)
      const oldOrderIdMatch = messageText.match(/(\d{8}-\d{3})/);
      if (oldOrderIdMatch) {
        return oldOrderIdMatch[1];
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

  async storeConnectionStatus(status, phoneNumber) {
    try {
      // First, try to update existing record
      const updated = await database.query('bot_connection_status')
        .where('id', 1)
        .update({
          status,
          phone_number: phoneNumber,
          updated_at: new Date()
        });
      
      // If no record was updated, insert a new one
      if (updated === 0) {
        await database.query('bot_connection_status')
          .insert({
            id: 1,
            status,
            phone_number: phoneNumber,
            updated_at: new Date()
          });
      }
      
      logger.info('Connection status stored in database:', { status, phoneNumber });
    } catch (error) {
      logger.error('Error storing connection status:', error);
    }
  }

  async getConnectionStatus() {
    try {
      const status = await database.query('bot_connection_status')
        .where('id', 1)
        .first();
      
      if (status) {
        return {
          status: status.status,
          phoneNumber: status.phone_number,
          lastUpdated: status.updated_at
        };
      }
      
      return {
        status: 'unknown',
        phoneNumber: null,
        lastUpdated: null
      };
    } catch (error) {
      logger.error('Error getting connection status:', error);
      return {
        status: 'error',
        phoneNumber: null,
        lastUpdated: null
      };
    }
  }
}

module.exports = WhatsAppService; 