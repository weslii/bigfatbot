const WhatsAppService = require('./WhatsAppService');
const TelegramService = require('./TelegramService');
const logger = require('../utils/logger');

class BotServiceManager {
  static instance = null;

  static getInstance() {
    if (!BotServiceManager.instance) {
      BotServiceManager.instance = new BotServiceManager();
    }
    return BotServiceManager.instance;
  }

  constructor() {
    this.whatsappService = WhatsAppService.getInstance();
    this.telegramService = TelegramService.getInstance();
    this.isInitialized = false;
  }

  async initialize() {
    try {
      logger.info('Initializing Bot Service Manager...');
      
      // Initialize both services
      await this.whatsappService.start();
      await this.telegramService.start();
      
      this.isInitialized = true;
      logger.info('Bot Service Manager initialized successfully');
    } catch (error) {
      logger.error('Error initializing Bot Service Manager:', error);
      throw error;
    }
  }

  async shutdown() {
    try {
      logger.info('Shutting down Bot Service Manager...');
      
      // Stop both services
      await this.whatsappService.stop();
      await this.telegramService.stop();
      
      this.isInitialized = false;
      logger.info('Bot Service Manager shut down successfully');
    } catch (error) {
      logger.error('Error shutting down Bot Service Manager:', error);
      throw error;
    }
  }

  // Unified bot info method
  async getBotInfo(platform = 'all') {
    try {
      if (platform === 'whatsapp') {
        return await this.whatsappService.getBotInfo();
      } else if (platform === 'telegram') {
        return await this.telegramService.getBotInfo();
      } else {
        // Return info for both platforms
        const [whatsappInfo, telegramInfo] = await Promise.all([
          this.whatsappService.getBotInfo(),
          this.telegramService.getBotInfo()
        ]);

        return {
          whatsapp: whatsappInfo,
          telegram: telegramInfo,
          platforms: ['whatsapp', 'telegram']
        };
      }
    } catch (error) {
      logger.error('Error getting bot info:', error);
      throw error;
    }
  }

  // Unified authentication status check
  async checkAuthenticationStatus(platform = 'all') {
    try {
      if (platform === 'whatsapp') {
        return await this.whatsappService.checkAuthenticationStatus();
      } else if (platform === 'telegram') {
        return await this.telegramService.checkAuthenticationStatus();
      } else {
        // Return status for both platforms
        const [whatsappStatus, telegramStatus] = await Promise.all([
          this.whatsappService.checkAuthenticationStatus(),
          this.telegramService.checkAuthenticationStatus()
        ]);

        return {
          whatsapp: whatsappStatus,
          telegram: telegramStatus,
          allAuthenticated: whatsappStatus.authenticated && telegramStatus.authenticated
        };
      }
    } catch (error) {
      logger.error('Error checking authentication status:', error);
      throw error;
    }
  }

  // Unified restart method
  async restartBot(platform = 'all') {
    try {
      if (platform === 'whatsapp') {
        return await this.whatsappService.restart();
      } else if (platform === 'telegram') {
        return await this.telegramService.restart();
      } else {
        // Restart both platforms
        const [whatsappResult, telegramResult] = await Promise.all([
          this.whatsappService.restart(),
          this.telegramService.restart()
        ]);

        return {
          whatsapp: whatsappResult,
          telegram: telegramResult,
          success: whatsappResult.authenticated && telegramResult.authenticated
        };
      }
    } catch (error) {
      logger.error('Error restarting bot:', error);
      throw error;
    }
  }

  // Unified QR code status (Telegram doesn't use QR codes)
  getLatestQrStatus(platform = 'whatsapp') {
    try {
      if (platform === 'whatsapp') {
        return this.whatsappService.getLatestQrStatus();
      } else if (platform === 'telegram') {
        return this.telegramService.getLatestQrStatus();
      } else {
        return {
          whatsapp: this.whatsappService.getLatestQrStatus(),
          telegram: this.telegramService.getLatestQrStatus()
        };
      }
    } catch (error) {
      logger.error('Error getting QR status:', error);
      throw error;
    }
  }

  // Unified metrics
  async getBotMetrics(platform = 'all') {
    try {
      if (platform === 'whatsapp') {
        return await this.whatsappService.getBotMetrics();
      } else if (platform === 'telegram') {
        return await this.telegramService.getBotMetrics();
      } else {
        // Return metrics for both platforms
        const [whatsappMetrics, telegramMetrics] = await Promise.all([
          this.whatsappService.getBotMetrics(),
          this.telegramService.getBotMetrics()
        ]);

        return {
          whatsapp: whatsappMetrics,
          telegram: telegramMetrics,
          combined: {
            totalMessages: whatsappMetrics.overall.total_messages + telegramMetrics.overall.total_messages,
            successfulParses: whatsappMetrics.overall.successful_parses + telegramMetrics.overall.successful_parses,
            failedParses: whatsappMetrics.overall.failed_parses + telegramMetrics.overall.failed_parses,
            averageResponseTime: (whatsappMetrics.overall.average_response_time + telegramMetrics.overall.average_response_time) / 2
          }
        };
      }
    } catch (error) {
      logger.error('Error getting bot metrics:', error);
      throw error;
    }
  }

  // Unified connection status
  async getConnectionStatus(platform = 'all') {
    try {
      if (platform === 'whatsapp') {
        return await this.whatsappService.getConnectionStatus();
      } else if (platform === 'telegram') {
        return await this.telegramService.getConnectionStatus();
      } else {
        // Return status for both platforms
        const [whatsappStatus, telegramStatus] = await Promise.all([
          this.whatsappService.getConnectionStatus(),
          this.telegramService.getConnectionStatus()
        ]);

        return {
          whatsapp: whatsappStatus,
          telegram: telegramStatus,
          allConnected: whatsappStatus.status === 'connected' && telegramStatus.status === 'connected'
        };
      }
    } catch (error) {
      logger.error('Error getting connection status:', error);
      throw error;
    }
  }

  // Platform-specific service getters
  getWhatsAppService() {
    return this.whatsappService;
  }

  getTelegramService() {
    return this.telegramService;
  }

  // Unified message sending
  async sendMessage(platform, chatId, message, options = {}) {
    try {
      if (platform === 'whatsapp') {
        return await this.whatsappService.sendMessage(chatId, message);
      } else if (platform === 'telegram') {
        return await this.telegramService.sendMessage(chatId, message, options);
      } else {
        throw new Error('Invalid platform specified');
      }
    } catch (error) {
      logger.error('Error sending message:', error);
      throw error;
    }
  }

  // Unified order operations
  async markOrderAsDelivered(platform, orderId, deliveryPerson, groupInfo) {
    try {
      if (platform === 'whatsapp') {
        return await this.whatsappService.markOrderAsDelivered(orderId, deliveryPerson, groupInfo);
      } else if (platform === 'telegram') {
        return await this.telegramService.markOrderAsDelivered(orderId, deliveryPerson, groupInfo);
      } else {
        throw new Error('Invalid platform specified');
      }
    } catch (error) {
      logger.error('Error marking order as delivered:', error);
      throw error;
    }
  }

  async cancelOrder(platform, orderId, cancelledBy, cancelledByNumber, groupInfo) {
    try {
      if (platform === 'whatsapp') {
        return await this.whatsappService.cancelOrder(orderId, cancelledBy, cancelledByNumber, groupInfo);
      } else if (platform === 'telegram') {
        return await this.telegramService.cancelOrder(orderId, cancelledBy, cancelledByNumber, groupInfo);
      } else {
        throw new Error('Invalid platform specified');
      }
    } catch (error) {
      logger.error('Error cancelling order:', error);
      throw error;
    }
  }

  // Memory optimization
  async optimizeMemory() {
    try {
      await Promise.all([
        this.whatsappService.optimizeMemory(),
        this.telegramService.optimizeMemory()
      ]);
      logger.info('Memory optimization completed for both platforms');
    } catch (error) {
      logger.error('Error during memory optimization:', error);
      throw error;
    }
  }

  // Health check
  async healthCheck() {
    try {
      const [whatsappHealth, telegramHealth] = await Promise.all([
        this.whatsappService.checkAuthenticationStatus(),
        this.telegramService.checkAuthenticationStatus()
      ]);

      return {
        status: 'ok',
        whatsapp: {
          status: whatsappHealth.authenticated ? 'connected' : 'disconnected',
          authenticated: whatsappHealth.authenticated
        },
        telegram: {
          status: telegramHealth.authenticated ? 'connected' : 'disconnected',
          authenticated: telegramHealth.authenticated
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Health check failed:', error);
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = BotServiceManager; 