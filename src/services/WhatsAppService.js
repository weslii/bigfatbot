const WhatsAppCoreService = require('./whatsapp/WhatsAppCoreService');
const WhatsAppEventHandler = require('./whatsapp/WhatsAppEventHandler');
const WhatsAppMessageHandler = require('./whatsapp/WhatsAppMessageHandler');
const WhatsAppOrderHandler = require('./whatsapp/WhatsAppOrderHandler');
const WhatsAppSetupHandler = require('./whatsapp/WhatsAppSetupHandler');
const WhatsAppMetricsService = require('./whatsapp/WhatsAppMetricsService');
const WhatsAppUtils = require('./whatsapp/WhatsAppUtils');
const NotificationService = require('./NotificationService');
const logger = require('../utils/logger');

class WhatsAppService {
  static instance = null;

  static getInstance() {
    if (!WhatsAppService.instance) {
      WhatsAppService.instance = new WhatsAppService();
    }
    return WhatsAppService.instance;
  }

  constructor() {
    this.core = new WhatsAppCoreService();
    this.metrics = new WhatsAppMetricsService();
    this.orderHandler = new WhatsAppOrderHandler(this.core);
    this.setupHandler = new WhatsAppSetupHandler(this.core);
    this.eventHandler = new WhatsAppEventHandler(this.core);
    this.messageHandler = new WhatsAppMessageHandler(this.core, this.orderHandler, this.setupHandler, this.metrics);
    
    // PRESERVE MEMORY OPTIMIZATION
    this.setupMemoryOptimization();
  }

  // PUBLIC INTERFACE METHODS
  async getBotInfo() {
    try {
      logger.info('=== getBotInfo() called ===');
      
      // Get connection status from database (works across processes)
      const connectionStatus = await this.core.getConnectionStatus();
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
      logger.info('Client exists:', !!this.core.client);
      logger.info('Client info exists:', !!(this.core.client && this.core.client.info));
      logger.info('Client info details:', this.core.client && this.core.client.info ? {
        hasWid: !!this.core.client.info.wid,
        widUser: this.core.client.info.wid?.user,
        pushname: this.core.client.info.pushname
      } : 'No client info');
      
      // Check if client exists and has info
      if (this.core.client && this.core.client.info && this.core.client.info.wid) {
        this.core.isAuthenticated = true;
        logger.info('Authentication status refreshed: Authenticated', {
          phoneNumber: this.core.client.info.wid.user
        });
      } else if (this.core.client && !this.core.client.info) {
        // Client exists but no info yet - might be connecting
        logger.info('Authentication status refreshed: Client connecting');
      } else {
        // No client or client not ready
        this.core.isAuthenticated = false;
        logger.info('Authentication status refreshed: Not authenticated');
      }
    } catch (error) {
      logger.error('Error refreshing authentication status:', error);
      this.core.isAuthenticated = false;
    }
  }

  async forceCheckAuthentication() {
    try {
      logger.info('=== forceCheckAuthentication() called ===');
      
      if (!this.core.client) {
        logger.info('No client available');
        return false;
      }

      // Try to get client info directly
      try {
        const info = this.core.client.info;
        logger.info('Direct client.info check:', info);
        
        if (info && info.wid && info.wid.user) {
          this.core.isAuthenticated = true;
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
        const isReady = this.core.client.pupPage && !this.core.client.pupPage.isClosed();
        logger.info('Client page ready check:', isReady);
        
        if (isReady) {
          // If page is ready but no info, might still be connecting
          logger.info('Force check: Client page is ready but no info yet');
          return false;
        }
      } catch (readyError) {
        logger.error('Error checking client readiness:', readyError);
      }

      this.core.isAuthenticated = false;
      logger.info('Force check: Client not authenticated');
      return false;
    } catch (error) {
      logger.error('Error in forceCheckAuthentication:', error);
      this.core.isAuthenticated = false;
      return false;
    }
  }

  getLatestQrStatus() {
    return {
      qr: this.core.latestQrDataUrl,
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
      logger.info(`Cleaned up ${toRemove} old messages from history`);
    }
    
    // Clear old pending setups (older than 2 hours - more conservative)
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    for (const [token, setup] of this.setupHandler.pendingSetups) {
      if (setup.createdAt && setup.createdAt < twoHoursAgo) {
        this.setupHandler.pendingSetups.delete(token);
        logger.info('Cleaned up old pending setup');
      }
    }
  }

  // Memory optimization method
  async optimizeMemory() {
    try {
      logger.info('Performing WhatsApp service memory optimization...');
      
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
      
      // DON'T clear browser cache - could cause WhatsApp to log out
      // Only clear if explicitly needed and safe
      
      logger.info('WhatsApp service memory optimization completed');
    } catch (error) {
      logger.error('Error during memory optimization:', error);
    }
  }

  async storeConnectionStatus(status, phoneNumber) {
    return await this.core.storeConnectionStatus(status, phoneNumber);
  }

  async getConnectionStatus() {
    return await this.core.getConnectionStatus();
  }

  // DELEGATE TO CORE SERVICE
  async start() {
    return await this.core.start();
  }

  async stop() {
    return await this.core.stop();
  }

  async restart() {
    return await this.core.restart();
  }

  async changeNumber() {
    return await this.core.changeNumber();
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
  async handleSetupCommand(message, chat, contact) {
    return await this.setupHandler.handleSetupCommand(message, chat, contact);
  }

  async handleSetupReply(message, chat, contact) {
    return await this.setupHandler.handleSetupReply(message, chat, contact);
  }

  async generateGroupSetupQR(userId, businessName) {
    return await this.setupHandler.generateGroupSetupQR(userId, businessName);
  }

  async handleGroupJoin(groupId, groupName) {
    return await this.setupHandler.handleGroupJoin(groupId, groupName);
  }

  async completeSetup(setup) {
    return await this.setupHandler.completeSetup(setup);
  }

  async getSetupStatus(userId, businessName) {
    return await this.setupHandler.getSetupStatus(userId, businessName);
  }

  // PRESERVE THESE EXACTLY AS IN ORIGINAL
  isLikelyOrder = WhatsAppUtils.isLikelyOrder;
  extractOrderIdFromMessage = WhatsAppUtils.extractOrderIdFromMessage;
  fallbackExtractOrderId = WhatsAppUtils.fallbackExtractOrderId;
}

module.exports = WhatsAppService; 