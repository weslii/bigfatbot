const TelegramBot = require('node-telegram-bot-api');
const logger = require('../../utils/logger');
const NotificationService = require('../NotificationService');

class TelegramCoreService {
  constructor() {
    this.bot = null;
    this.isAuthenticated = false;
    this.isStarting = false;
    this.isStopping = false;
    this.lastMessageTime = Date.now();
    this.messageCount = 0;
    this.maxMessageHistory = 100; // Limit message history
    this.messageHistory = []; // Store recent messages only
    this.cleanupInterval = null;
    this.botInfo = null;
    this.connectionMode = 'unknown'; // 'webhook' or 'polling'
  }

  async start() {
    try {
      // Store initial connecting status
      await this.storeConnectionStatus('connecting', null);
      
      // Initialize bot with token from environment
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
      }

      // Force polling in development, bot-only mode, or when explicitly requested
      const forcePolling = process.env.TELEGRAM_FORCE_POLLING === 'true' || 
                          process.env.NODE_ENV !== 'production' || 
                          process.env.BOT_ONLY === 'true';
      if (forcePolling) {
        try {
          const tempBot = new TelegramBot(token);
          await tempBot.deleteWebHook({ drop_pending_updates: false });
          logger.info('Deleted Telegram webhook (dev) before starting polling');
        } catch (err) {
          logger.warn('Could not delete webhook in dev (continuing with polling):', err.message);
        }

        this.bot = new TelegramBot(token, {
          polling: {
            timeout: 10,
            limit: 100,
            retryTimeout: 5000,
            autoStart: true,
            params: { timeout: 10 }
          }
        });
        this.connectionMode = 'polling';

        // Get bot info
        this.botInfo = await this.bot.getMe();
        this.isAuthenticated = true;
        await this.storeConnectionStatus('connected', this.botInfo.username);
        const reason = process.env.BOT_ONLY === 'true' ? 'bot-only mode' : 'development';
        logger.info(`Telegram started in polling mode (${reason})`);
        
        // Send service restart notification (non-blocking)
        try {
          const reason = process.env.BOT_ONLY === 'true' ? 'Bot-Only' : 'Dev';
          await NotificationService.notifyServiceRestart('Telegram Service', {
            'Start Time': new Date().toISOString(),
            'Status': `Running (Polling - ${reason})`,
            'Bot Username': this.botInfo.username
          });
        } catch (_) {}
        
        return; // Done for dev
      }

      // Try webhook first, fallback to polling
      const webhookUrl = await this.setupWebhook(token);
      
      if (webhookUrl) {
        // Use webhook mode
        this.bot = new TelegramBot(token, { 
          webHook: { 
            port: process.env.PORT || 3000,
            host: '0.0.0.0'
          } 
        });
        // Webhook was set (or already correct) inside setupWebhook
        logger.info('Telegram webhook mode enabled:', webhookUrl);
        this.connectionMode = 'webhook';
      } else {
        // Fallback to polling mode
        this.bot = new TelegramBot(token, {
          polling: {
            timeout: 10,           // Request timeout in seconds
            limit: 100,            // Number of messages to retrieve per request
            retryTimeout: 5000,    // Retry delay on failure (5 seconds)
            autoStart: true,       // Start polling immediately
            params: {
              timeout: 10          // Additional timeout for requests
            }
          }
        });
        
        logger.info('Telegram polling mode enabled (webhook fallback)');
        this.connectionMode = 'polling';
      }
      
      // Get bot info
      this.botInfo = await this.bot.getMe();
      this.isAuthenticated = true;
      
      logger.info('Telegram service started successfully', {
        botId: this.botInfo.id,
        botUsername: this.botInfo.username,
        botName: this.botInfo.first_name
      });
      
      // Store connection status
      await this.storeConnectionStatus('connected', this.botInfo.username);
      
      // Send service restart notification
      try {
        await NotificationService.notifyServiceRestart('Telegram Service', {
          'Start Time': new Date().toISOString(),
          'Status': 'Running',
          'Bot Username': this.botInfo.username
        });
      } catch (notificationError) {
        logger.error('Error sending service start notification:', notificationError);
      }
    } catch (error) {
      // Handle rate limit specifically: back off and fall back to polling
      const tooMany = error?.response?.body?.error_code === 429 || /Too Many Requests/i.test(error?.message || '');
      if (tooMany) {
        const retryAfter = Number(error?.response?.headers?.['retry-after'] || error?.response?.body?.parameters?.retry_after || 1);
        logger.warn('Telegram webhook rate-limited. Retrying after backoff and using polling fallback', { retryAfter });
        await new Promise(r => setTimeout(r, (retryAfter + 1) * 1000));
        try {
          // Ensure webhook is cleared before switching to polling
          try {
            const token = process.env.TELEGRAM_BOT_TOKEN;
            const tempBot = new TelegramBot(token);
            await tempBot.deleteWebHook({ drop_pending_updates: false });
            logger.info('Deleted Telegram webhook before starting polling');
          } catch (delErr) {
            logger.warn('Failed to delete webhook before polling (continuing):', delErr.message);
          }

          // Start in polling mode directly
          const token = process.env.TELEGRAM_BOT_TOKEN;
          this.bot = new TelegramBot(token, {
            polling: { timeout: 10, limit: 100, retryTimeout: 5000, autoStart: true, params: { timeout: 10 } }
          });
          this.connectionMode = 'polling';
          this.botInfo = await this.bot.getMe();
          this.isAuthenticated = true;
          await this.storeConnectionStatus('connected', this.botInfo.username);
          logger.info('Telegram started in polling mode after webhook rate-limit');
          return; // Successful fallback
        } catch (pollErr) {
          logger.error('Polling fallback failed after webhook 429:', pollErr);
        }
      }

      logger.error('Failed to start Telegram service:', error);
      // Store error status
      await this.storeConnectionStatus('error', null);
      
      // Start continuous service error notifications
      try {
        NotificationService.startContinuousErrorNotification('service', error, {
          'Component': 'Telegram Service',
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
      logger.info('Stopping Telegram service...');

      // Store stopping status
      await this.storeConnectionStatus('stopping', null);

      // Clear cleanup interval
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }

      // Clear message history
      this.messageHistory = [];

      // Stop bot polling
      if (this.bot) {
        await this.bot.stopPolling();
        this.bot = null;
      }

      this.isAuthenticated = false;
      this.botInfo = null;
      this.isStarting = false;
      this.isStopping = false;

      // Store stopped status
      await this.storeConnectionStatus('disconnected', null);

      logger.info('Telegram service stopped successfully');
      
      // Stop all continuous error notifications when service is properly stopped
      NotificationService.stopAllContinuousErrorNotifications();
      
      // Send service stop notification
      await NotificationService.notifyServiceRestart('Telegram Service', {
        'Stop Time': new Date().toISOString(),
        'Status': 'Stopped',
        'Reason': 'Manual stop'
      });
    } catch (error) {
      logger.error('Error stopping Telegram service:', error);
      // Store error status
      await this.storeConnectionStatus('error', null);
      
      // Start continuous service error notifications
      try {
        NotificationService.startContinuousErrorNotification('service', error, {
          'Component': 'Telegram Service',
          'Action': 'Stop',
          'Error Type': 'Service Stop Failure'
        });
      } catch (notificationError) {
        logger.error('Error starting continuous service error notification:', notificationError);
      }
    }
  }

  async restart() {
    try {
      logger.info('Restarting Telegram service...');
      
      // Stop current bot if running
      if (this.bot) {
        await this.bot.stopPolling();
        this.bot = null;
      }
      
      // Reinitialize bot
      await this.start();
      
      logger.info('Telegram service restarted successfully');
      return { authenticated: this.isAuthenticated };
    } catch (error) {
      logger.error('Restart failed:', error);
      throw error;
    }
  }

  async checkAuthenticationStatus() {
    try {
      if (!this.bot) {
        logger.info('Authentication check: Bot not initialized');
        this.isAuthenticated = false;
        return {
          success: true,
          authenticated: false,
          message: 'Telegram bot not initialized.',
          needsSetup: true
        };
      }

      if (this.isAuthenticated && this.botInfo) {
        logger.info('Authentication check: Bot is authenticated', {
          botId: this.botInfo.id,
          botUsername: this.botInfo.username
        });
        return {
          success: true,
          authenticated: true,
          message: 'Telegram bot is authenticated and connected.',
          botUsername: this.botInfo.username
        };
      } else {
        logger.info('Authentication check: Not authenticated');
        this.isAuthenticated = false;
        return {
          success: true,
          authenticated: false,
          message: 'Telegram bot requires authentication.',
          needsSetup: true
        };
      }
    } catch (error) {
      logger.error('Error checking authentication status:', error);
      this.isAuthenticated = false;
      return {
        success: false,
        authenticated: false,
        message: 'Failed to check authentication status. Please try again.',
        needsSetup: true
      };
    }
  }

  async storeConnectionStatus(status, botUsername) {
    try {
      const database = require('../../config/database');
      // First, try to update existing record for Telegram (id = 2)
      const updated = await database.query('bot_connection_status')
        .where('id', 2)
        .update({
          status,
          phone_number: botUsername, // Reuse phone_number field for bot username
          updated_at: new Date()
        });
      
      // If no record was updated, insert a new one
      if (updated === 0) {
        await database.query('bot_connection_status')
          .insert({
            id: 2,
            status,
            phone_number: botUsername,
            updated_at: new Date()
          });
      }
      
      logger.info('Telegram connection status stored in database:', { status, botUsername });
    } catch (error) {
      logger.error('Error storing Telegram connection status:', error);
    }
  }

  async getConnectionStatus() {
    try {
      const database = require('../../config/database');
      const status = await database.query('bot_connection_status')
        .where('id', 2)
        .first();
      
      if (status) {
        return {
          status: status.status,
          botUsername: status.phone_number, // Reuse phone_number field for bot username
          lastUpdated: status.updated_at
        };
      }
      
      return {
        status: 'unknown',
        botUsername: null,
        lastUpdated: null
      };
    } catch (error) {
      logger.error('Error getting Telegram connection status:', error);
      return {
        status: 'error',
        botUsername: null,
        lastUpdated: null
      };
    }
  }

  async sendMessage(chatId, message, options = {}) {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized');
    }
    
    try {
      const result = await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...options
      });
      
      // Add to message history
      this.messageHistory.push({
        id: result.message_id,
        chatId,
        text: message,
        timestamp: Date.now()
      });
      
      // Cleanup old messages if needed
      if (this.messageHistory.length > this.maxMessageHistory) {
        this.messageHistory = this.messageHistory.slice(-this.maxMessageHistory);
      }
      
      return result;
    } catch (error) {
      logger.error('Error sending Telegram message:', error);
      throw error;
    }
  }

  async deleteMessage(chatId, messageId) {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized');
    }
    
    try {
      await this.bot.deleteMessage(chatId, messageId);
      
      // Remove from message history
      this.messageHistory = this.messageHistory.filter(msg => msg.id !== messageId);
    } catch (error) {
      logger.error('Error deleting Telegram message:', error);
      throw error;
    }
  }

  getBotInfo() {
    return this.botInfo;
  }

  async setupWebhook(token) {
    try {
      // Check if we have a public domain
      const publicDomain = process.env.RAILWAY_PUBLIC_DOMAIN || 
                          process.env.CUSTOM_DOMAIN || 
                          'novi.com.ng';
      
      if (!publicDomain || publicDomain === 'localhost') {
        logger.info('No public domain available, will use polling');
        return null;
      }

      // Construct webhook URL
      const webhookUrl = `https://${publicDomain}/webhook/telegram`;
      logger.info('Attempting to set up webhook:', webhookUrl);

      const testBot = new TelegramBot(token);

      // Check existing webhook
      try {
        const info = await testBot.getWebHookInfo();
        const currentUrl = info?.url || '';
        if (currentUrl === webhookUrl) {
          logger.info('Webhook already set to desired URL, reusing existing webhook');
          return webhookUrl;
        }
      } catch (iErr) {
        logger.warn('Could not fetch existing webhook info, continuing:', iErr.message);
      }

      // Try to set webhook (this may be rate-limited)
      await testBot.setWebHook(webhookUrl);
      logger.info('Webhook setup successful');
      return webhookUrl;
      
    } catch (error) {
      // Handle rate limiting gracefully here too
      const tooMany = error?.response?.body?.error_code === 429 || /Too Many Requests/i.test(error?.message || '');
      if (tooMany) {
        const retryAfter = Number(error?.response?.headers?.['retry-after'] || error?.response?.body?.parameters?.retry_after || 1);
        logger.warn('Webhook setup rate-limited. Will skip webhook and use polling', { retryAfter });
        return null;
      }
      logger.warn('Webhook setup failed, will use polling:', error.message);
      return null;
    }
  }

  async switchToPolling() {
    if (this.bot && this.connectionMode === 'webhook') {
      try {
        // Delete webhook
        await this.bot.deleteWebHook();
        
        // Restart with polling
        await this.stop();
        await this.start();
        
        logger.info('Switched from webhook to polling mode');
      } catch (error) {
        logger.error('Error switching to polling:', error);
      }
    }
  }

  async switchToWebhook() {
    if (this.bot && this.connectionMode === 'polling') {
      try {
        // Stop polling
        await this.bot.stopPolling();
        
        // Restart with webhook
        await this.stop();
        await this.start();
        
        logger.info('Switched from polling to webhook mode');
      } catch (error) {
        logger.error('Error switching to webhook:', error);
      }
    }
  }
}

module.exports = TelegramCoreService; 