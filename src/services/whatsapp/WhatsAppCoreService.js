const { Client, LocalAuth } = require('whatsapp-web.js');
const logger = require('../../utils/logger');
const NotificationService = require('../NotificationService');

class WhatsAppCoreService {
  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'bigfatbot-whatsapp',
        dataPath: './.wwebjs_auth'
      }),
      puppeteer: {
        headless: false,
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
          '--max_old_space_size=512',
          '--js-flags=--max-old-space-size=512',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-extensions-except',
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
          '--safebrowsing-disable-auto-update',
          '--disable-client-side-phishing-detection',
          '--disable-component-update',
          '--disable-domain-reliability',
          '--disable-features=AudioServiceOutOfProcess',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--memory-pressure-off',
          '--max_old_space_size=512',
          '--js-flags=--max-old-space-size=512',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--allow-running-insecure-content',
          '--disable-features=VizDisplayCompositor',
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-gpu-sandbox',
          '--disable-software-rasterizer',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--memory-pressure-off',
          '--max_old_space_size=512',
          '--js-flags=--max-old-space-size=512'
        ],
        defaultViewport: {
          width: 800,
          height: 600
        },
        timeout: 60000,
        protocolTimeout: 60000
      },
      // Memory optimization options
      disableWelcome: true,
      useChrome: false,
      takeoverOnConflict: true,
      takeoverTimeoutMs: 10000,
      qrMaxRetries: 5,
      authTimeoutMs: 60000,
      restartOnAuthFail: true
    });

    this.isAuthenticated = false;
    this.latestQrDataUrl = null;
    this.isStarting = false;
    this.isStopping = false;
    this.lastMessageTime = Date.now();
    this.messageCount = 0;
    this.maxMessageHistory = 100; // Limit message history
    this.messageHistory = []; // Store recent messages only
    this.cleanupInterval = null;
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

  async forceProcessRestart(reason = 'Manual or automatic hard restart requested') {
    logger.error(`Forcefully exiting process: ${reason}`);
    try {
      // Add timeout for notifications (10 seconds max)
      await Promise.race([
        NotificationService.startContinuousErrorNotification('service', new Error(reason), {
          'Component': 'WhatsApp Service',
          'Action': 'Force Restart',
          'Error Type': 'Process Exit',
          'Time': new Date().toISOString(),
        }),
        new Promise(resolve => setTimeout(resolve, 10000))
      ]);
    } catch (e) {
      logger.error('Failed to send force restart notification:', e);
    } finally {
      try {
        process.exit(1); // Ensure exit even if notification fails
      } catch (exitErr) {
        logger.error('Process exit failed:', exitErr);
      }
    }
  }

  async restart() {
    try {
      logger.info('Restarting WhatsApp service...');
      // Cleanup existing client
      if (this.client && this.client.pupPage && !this.client.pupPage.isClosed()) {
        logger.info('Stopping current WhatsApp client...');
        await this.client.destroy();
        logger.info('WhatsApp client stopped successfully');
      }
      // Reinitialize with timeout
      const INIT_TIMEOUT = 20000; // 20 seconds
      await Promise.race([
        this.client.initialize(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Initialization timed out')), INIT_TIMEOUT)
        )
      ]);
      const authStatus = await this.checkAuthenticationStatus();
      logger.info('WhatsApp service restarted successfully');
      return authStatus;
    } catch (error) {
      logger.error('Restart failed:', error);
      // Handle timeouts and connection issues
      if (/timed out|ECONN/i.test(error.message)) {
        await this.forceProcessRestart(`Restart failure: ${error.message}`);
      }
      throw error; // Propagate other errors
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

  async storeConnectionStatus(status, phoneNumber) {
    try {
      const database = require('../../config/database');
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
      const database = require('../../config/database');
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

  async sendMessage(chatId, message, options = {}) {
    try {
      if (!this.client || !this.isAuthenticated) {
        logger.error('Cannot send message: WhatsApp client not authenticated');
        throw new Error('WhatsApp client not authenticated');
      }

      const sentMessage = await this.client.sendMessage(chatId, message, options);
      
      // Update message history with proper error handling
      try {
        const messageId = sentMessage?.id?._serialized || sentMessage?.id || 'unknown';
        this.messageHistory.push({
          id: messageId,
          chatId: chatId,
          message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
          timestamp: Date.now()
        });

        // Keep only recent messages
        if (this.messageHistory.length > this.maxMessageHistory) {
          this.messageHistory = this.messageHistory.slice(-this.maxMessageHistory);
        }

        this.lastMessageTime = Date.now();
        this.messageCount++;
        
        logger.debug('Message sent successfully', {
          messageId: messageId,
          chatId: chatId,
          messageLength: message.length
        });
      } catch (historyError) {
        logger.warn('Error updating message history:', historyError);
        // Don't fail the entire send operation if history update fails
      }

      return sentMessage;
    } catch (error) {
      logger.error('Error sending WhatsApp message:', error);
      throw error;
    }
  }

  async deleteMessage(chatId, messageId) {
    try {
      if (!this.client || !this.isAuthenticated) {
        logger.error('Cannot delete message: WhatsApp client not authenticated');
        throw new Error('WhatsApp client not authenticated');
      }

      await this.client.deleteMessage(chatId, messageId);
      logger.debug('Message deleted successfully', { messageId, chatId });
    } catch (error) {
      logger.error('Error deleting WhatsApp message:', error);
      throw error;
    }
  }
}

module.exports = WhatsAppCoreService; 