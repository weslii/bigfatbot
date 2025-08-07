const TelegramCoreService = require('./telegram/TelegramCoreService');
const TelegramEventHandler = require('./telegram/TelegramEventHandler');
const TelegramMessageHandler = require('./telegram/TelegramMessageHandler');
const TelegramOrderHandler = require('./telegram/TelegramOrderHandler');
const TelegramSetupHandler = require('./telegram/TelegramSetupHandler');
const TelegramMetricsService = require('./telegram/TelegramMetricsService');
const TelegramUtils = require('./telegram/TelegramUtils');
const NotificationService = require('./NotificationService');
const logger = require('../utils/logger');

class TelegramService {
  static instance = null;

  static getInstance() {
    if (!TelegramService.instance) {
      TelegramService.instance = new TelegramService();
    }
    return TelegramService.instance;
  }

  constructor() {
    this.core = new TelegramCoreService();
    this.metrics = new TelegramMetricsService();
    this.orderHandler = new TelegramOrderHandler(this.core);
    this.setupHandler = new TelegramSetupHandler(this.core);
    this.eventHandler = new TelegramEventHandler(this.core, this.setupHandler);
    this.messageHandler = new TelegramMessageHandler(this.core, this.orderHandler, this.setupHandler, this.metrics);
    
    // PRESERVE MEMORY OPTIMIZATION
    this.setupMemoryOptimization();
  }

  // PUBLIC INTERFACE METHODS
  async getBotInfo() {
    try {
      logger.info('=== getBotInfo() called for Telegram ===');
      
      // Get connection status from database (works across processes)
      const connectionStatus = await this.core.getConnectionStatus();
      logger.info('Database connection status:', connectionStatus);
      
      // Map database status to bot info
      switch (connectionStatus.status) {
        case 'connected':
        case 'authenticated':
          return {
            number: connectionStatus.botUsername || 'Connected',
            name: 'Telegram Bot',
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
      logger.error('Error getting Telegram bot info:', error);
      return {
        number: 'Error getting number',
        name: 'Telegram Bot',
        status: 'error'
      };
    }
  }

  async refreshAuthenticationStatus() {
    try {
      logger.info('=== refreshAuthenticationStatus() called for Telegram ===');
      logger.info('Bot exists:', !!this.core.bot);
      logger.info('Bot info exists:', !!(this.core.bot && this.core.botInfo));
      logger.info('Bot info details:', this.core.bot && this.core.botInfo ? {
        botId: this.core.botInfo.id,
        botUsername: this.core.botInfo.username,
        botName: this.core.botInfo.first_name
      } : 'No bot info');
      
      // Check if bot exists and has info
      if (this.core.bot && this.core.botInfo) {
        this.core.isAuthenticated = true;
        logger.info('Authentication status refreshed: Authenticated', {
          botUsername: this.core.botInfo.username
        });
      } else if (this.core.bot && !this.core.botInfo) {
        // Bot exists but no info yet - might be connecting
        logger.info('Authentication status refreshed: Bot connecting');
      } else {
        // No bot or bot not ready
        this.core.isAuthenticated = false;
        logger.info('Authentication status refreshed: Not authenticated');
      }
    } catch (error) {
      logger.error('Error refreshing Telegram authentication status:', error);
      this.core.isAuthenticated = false;
    }
  }

  async forceCheckAuthentication() {
    try {
      logger.info('=== forceCheckAuthentication() called for Telegram ===');
      
      if (!this.core.bot) {
        logger.info('No Telegram bot available');
        return false;
      }

      // Try to get bot info directly
      try {
        const info = this.core.botInfo;
        logger.info('Direct bot.info check:', info);
        
        if (info && info.username) {
          this.core.isAuthenticated = true;
          logger.info('Force check: Bot is authenticated', {
            botId: info.id,
            botUsername: info.username,
            botName: info.first_name
          });
          return true;
        }
      } catch (infoError) {
        logger.error('Error getting bot.info:', infoError);
      }

      // Try to check if bot is ready
      try {
        const isReady = this.core.bot && this.core.bot.isPolling();
        logger.info('Bot polling ready check:', isReady);
        
        if (isReady) {
          // If bot is polling but no info, might still be connecting
          logger.info('Force check: Bot is polling but no info yet');
          return false;
        }
      } catch (readyError) {
        logger.error('Error checking bot readiness:', readyError);
      }

      this.core.isAuthenticated = false;
      logger.info('Force check: Bot not authenticated');
      return false;
    } catch (error) {
      logger.error('Error in forceCheckAuthentication for Telegram:', error);
      this.core.isAuthenticated = false;
      return false;
    }
  }

  getLatestQrStatus() {
    // Telegram doesn't use QR codes, but we maintain the interface for consistency
    return {
      qr: null,
      authenticated: this.core.isAuthenticated
    };
  }

  setupMemoryOptimization() {
    // Cleanup old messages every 10 minutes (less frequent)
    this.core.cleanupInterval = setInterval(() => {
      this.cleanupMessageHistory();
    }, 10 * 60 * 1000);
  }

  cleanupMessageHistory() {
    // Only cleanup if we have too many messages
    if (this.core.messageHistory.length > this.core.maxMessageHistory) {
      const toRemove = this.core.messageHistory.length - this.core.maxMessageHistory;
      this.core.messageHistory.splice(0, toRemove);
      logger.info(`Cleaned up ${toRemove} old Telegram messages from history`);
    }
    
    // Clear old pending setups (older than 2 hours - more conservative)
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    for (const [token, setup] of this.setupHandler.pendingSetups) {
      if (setup.createdAt && setup.createdAt < twoHoursAgo) {
        this.setupHandler.pendingSetups.delete(token);
        logger.info('Cleaned up old pending Telegram setup');
      }
    }
  }

  // Memory optimization method
  async optimizeMemory() {
    try {
      logger.info('Performing Telegram service memory optimization...');
      
      // Clear message history (but keep recent messages)
      if (this.core.messageHistory.length > 50) {
        this.core.messageHistory = this.core.messageHistory.slice(-50);
      }
      
      // Clear old pending setups (older than 2 hours)
      const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
      for (const [token, setup] of this.setupHandler.pendingSetups) {
        if (setup.createdAt && setup.createdAt < twoHoursAgo) {
          this.setupHandler.pendingSetups.delete(token);
        }
      }
      
      logger.info('Telegram service memory optimization completed');
    } catch (error) {
      logger.error('Error during Telegram memory optimization:', error);
    }
  }

  async storeConnectionStatus(status, botUsername) {
    return await this.core.storeConnectionStatus(status, botUsername);
  }

  async getConnectionStatus() {
    return await this.core.getConnectionStatus();
  }

  // DELEGATE TO CORE SERVICE
  async start() {
    try {
      await this.core.start();
      // Initialize event handlers after bot is started
      this.eventHandler.initializeHandlers();
      
      // Set up message handler after bot is initialized
      if (this.core.bot) {
        logger.info('Setting up Telegram message handler after bot initialization');
        this.core.bot.on('message', this.messageHandler.handleMessage.bind(this.messageHandler));
      }
      
      await this.metrics.loadMetrics();
      logger.info('Telegram service started successfully');
    } catch (error) {
      logger.error('Failed to start Telegram service:', error);
      throw error;
    }
  }

  async stop() {
    return await this.core.stop();
  }

  async restart() {
    return await this.core.restart();
  }

  async checkAuthenticationStatus() {
    return await this.core.checkAuthenticationStatus();
  }

  // DELEGATE TO METRICS SERVICE
  async loadMetrics() {
    return await this.metrics.loadMetrics();
  }

  async saveMetrics(metrics) {
    return await this.metrics.saveMetrics(metrics);
  }

  async updateMetrics(params) {
    return await this.metrics.updateMetrics(params);
  }

  async getBotMetrics() {
    return await this.metrics.getBotMetrics();
  }

  // DELEGATE TO ORDER HANDLER
  async markOrderAsDelivered(orderId, deliveryPerson, groupInfo) {
    return await this.orderHandler.markOrderAsDelivered(orderId, deliveryPerson, groupInfo);
  }

  async cancelOrder(orderId, cancelledBy, cancelledByNumber, groupInfo) {
    return await this.orderHandler.cancelOrder(orderId, cancelledBy, cancelledByNumber, groupInfo);
  }

  async sendHelpMessage(groupInfo) {
    return await this.orderHandler.sendHelpMessage(groupInfo);
  }

  async sendDailyReport(groupInfo) {
    return await this.orderHandler.sendDailyReport(groupInfo);
  }

  async sendPendingOrders(groupInfo) {
    return await this.orderHandler.sendPendingOrders(groupInfo);
  }

  async sendWeeklyReport(groupInfo) {
    return await this.orderHandler.sendWeeklyReport(groupInfo);
  }

  async sendMonthlyReport(groupInfo) {
    return await this.orderHandler.sendMonthlyReport(groupInfo);
  }

  // DELEGATE TO SETUP HANDLER
  async handleSetupCommand(message, chatId, sender) {
    return await this.setupHandler.handleSetupCommand(message, chatId, sender);
  }

  async handleSetupReply(message, chatId, sender) {
    return await this.setupHandler.handleSetupReply(message, chatId, sender);
  }

  async handleCallbackQuery(query) {
    return await this.setupHandler.handleCallbackQuery(query);
  }

  async getSetupStatus(chatId) {
    return await this.setupHandler.getSetupStatus(chatId);
  }

  async sendMessage(chatId, message, options = {}) {
    if (!this.core.bot) throw new Error('Telegram bot not initialized');
    return await this.core.sendMessage(chatId, message, options);
  }

  async deleteMessage(chatId, messageId) {
    if (!this.core.bot) throw new Error('Telegram bot not initialized');
    return await this.core.deleteMessage(chatId, messageId);
  }

  // PRESERVE THESE EXACTLY AS IN ORIGINAL
  isLikelyOrder = TelegramUtils.isLikelyOrder;
  extractOrderIdFromMessage = TelegramUtils.extractOrderIdFromMessage;
  fallbackExtractOrderId = TelegramUtils.fallbackExtractOrderId;

  // Handle webhook messages
  async handleMessage(message) {
    try {
      logger.info('Telegram webhook message received:', {
        messageId: message.message_id,
        chatId: message.chat.id,
        from: message.from?.username || message.from?.first_name,
        text: message.text?.substring(0, 100) + (message.text?.length > 100 ? '...' : '')
      });

      // Use the message handler to process the message
      await this.messageHandler.handleMessage(message);
      
    } catch (error) {
      logger.error('Error handling webhook message:', error);
      throw error;
    }
  }
}

module.exports = TelegramService; 