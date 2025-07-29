const TelegramBot = require('node-telegram-bot-api');
const logger = require('../../utils/logger');
const NotificationService = require('../NotificationService');

class TelegramCoreService {
  constructor() {
    this.bot = null;
    this.isAuthenticated = false;
    this.latestQrDataUrl = null;
    this.isStarting = false;
    this.isStopping = false;
    this.lastMessageTime = Date.now();
    this.messageCount = 0;
    this.maxMessageHistory = 100; // Limit message history
    this.messageHistory = []; // Store recent messages only
    this.cleanupInterval = null;
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  }

  async start() {
    try {
      if (!this.botToken) {
        throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
      }

      // Store initial connecting status
      await this.storeConnectionStatus('connecting', null);
      
      // Initialize bot
      this.bot = new TelegramBot(this.botToken, {
        polling: !this.webhookUrl, // Use polling if no webhook URL
        webHook: this.webhookUrl ? {} : false // Webhook config without port - let the server handle it
      });

      // Setup event handlers
      this.setupEventHandlers();

      // Start polling or webhook
      if (this.webhookUrl) {
        await this.bot.setWebHook(`${this.webhookUrl}/telegram-webhook`);
        logger.info('Telegram webhook set successfully');
      } else {
        await this.bot.startPolling();
        logger.info('Telegram polling started successfully');
      }

      // Get bot info
      const botInfo = await this.bot.getMe();
      logger.info('Telegram bot info:', botInfo);

      // Store connected status
      await this.storeConnectionStatus('connected', botInfo.username);
      
      logger.info('Telegram service started successfully');
      
      // Send service restart notification
      try {
        await NotificationService.notifyServiceRestart('Telegram Service', {
          'Start Time': new Date().toISOString(),
          'Status': 'Running',
          'Bot Username': botInfo.username
        });
      } catch (notificationError) {
        logger.error('Error sending Telegram service start notification:', notificationError);
      }
    } catch (error) {
      logger.error('Failed to start Telegram service:', error);
      // Store error status
      await this.storeConnectionStatus('error', null);
      
      // Start continuous service error notifications
      try {
        NotificationService.startContinuousErrorNotification('service', error, {
          'Component': 'Telegram Core Service',
          'Action': 'Start',
          'Bot Token': this.botToken ? 'Present' : 'Missing'
        });
      } catch (notificationError) {
        logger.error('Error starting continuous error notification for Telegram:', notificationError);
      }
      
      throw error;
    }
  }

  setupEventHandlers() {
    if (!this.bot) return;

    this.bot.on('polling_error', (error) => {
      logger.error('Telegram polling error:', error);
      this.isAuthenticated = false;
      this.storeConnectionStatus('error', null);
    });

    this.bot.on('webhook_error', (error) => {
      logger.error('Telegram webhook error:', error);
      this.isAuthenticated = false;
      this.storeConnectionStatus('error', null);
    });

    this.bot.on('error', (error) => {
      logger.error('Telegram bot error:', error);
      this.isAuthenticated = false;
      this.storeConnectionStatus('error', null);
    });

    // Connection events
    this.bot.on('polling_start', () => {
      logger.info('Telegram polling started');
      this.isAuthenticated = true;
      this.storeConnectionStatus('connected', null);
    });

    this.bot.on('polling_stop', () => {
      logger.info('Telegram polling stopped');
      this.isAuthenticated = false;
      this.storeConnectionStatus('disconnected', null);
    });
  }

  async stop() {
    try {
      this.isStopping = true;
      logger.info('Stopping Telegram service...');

      // Store stopping status
      await this.storeConnectionStatus('stopping', null);

      if (this.bot) {
        if (this.webhookUrl) {
          await this.bot.deleteWebHook();
          logger.info('Telegram webhook deleted');
        } else {
          await this.bot.stopPolling();
          logger.info('Telegram polling stopped');
        }
      }

      this.isAuthenticated = false;
      await this.storeConnectionStatus('disconnected', null);

      logger.info('Telegram service stopped successfully');
    } catch (error) {
      logger.error('Error stopping Telegram service:', error);
      await this.storeConnectionStatus('error', null);
      throw error;
    } finally {
      this.isStopping = false;
    }
  }

  async restart() {
    try {
      logger.info('Restarting Telegram service...');
      await this.stop();
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      await this.start();
      logger.info('Telegram service restarted successfully');
    } catch (error) {
      logger.error('Error restarting Telegram service:', error);
      throw error;
    }
  }

  async checkAuthenticationStatus() {
    try {
      if (!this.bot) {
        this.isAuthenticated = false;
        return false;
      }

      // Check if bot is polling or webhook is active
      const isConnected = this.webhookUrl ? 
        await this.bot.getWebhookInfo().then(info => info.url === `${this.webhookUrl}/telegram-webhook`) :
        this.bot.isPolling();

      this.isAuthenticated = isConnected;
      
      if (isConnected) {
        await this.storeConnectionStatus('connected', null);
      } else {
        await this.storeConnectionStatus('disconnected', null);
      }

      return isConnected;
    } catch (error) {
      logger.error('Error checking Telegram authentication status:', error);
      this.isAuthenticated = false;
      await this.storeConnectionStatus('error', null);
      return false;
    }
  }

  async storeConnectionStatus(status, botUsername) {
    try {
      const database = require('../../config/database');
      
      // Check if bot_connection_status table exists
      const tableExists = await database.raw(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'bot_connection_status'
        );
      `);

      if (!tableExists.rows[0].exists) {
        logger.warn('bot_connection_status table does not exist, skipping status storage');
        return;
      }

      await database.query('bot_connection_status')
        .where({ id: 1 })
        .update({
          status: status,
          phone_number: botUsername, // Store bot username instead of phone number
          updated_at: new Date()
        });
    } catch (error) {
      logger.error('Error storing Telegram connection status:', error);
    }
  }

  async getConnectionStatus() {
    try {
      const database = require('../../config/database');
      
      // Check if bot_connection_status table exists
      const tableExists = await database.raw(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'bot_connection_status'
        );
      `);

      if (!tableExists.rows[0].exists) {
        return { status: 'unknown', phoneNumber: null };
      }

      const status = await database.query('bot_connection_status')
        .where({ id: 1 })
        .first();

      return status || { status: 'unknown', phoneNumber: null };
    } catch (error) {
      logger.error('Error getting Telegram connection status:', error);
      return { status: 'error', phoneNumber: null };
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

      // Update metrics
      this.messageCount++;
      this.lastMessageTime = Date.now();

      return result;
    } catch (error) {
      logger.error('Error sending Telegram message:', error);
      throw error;
    }
  }

  async getChat(chatId) {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized');
    }

    try {
      return await this.bot.getChat(chatId);
    } catch (error) {
      logger.error('Error getting Telegram chat:', error);
      throw error;
    }
  }

  async getChatMember(chatId, userId) {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized');
    }

    try {
      return await this.bot.getChatMember(chatId, userId);
    } catch (error) {
      logger.error('Error getting Telegram chat member:', error);
      throw error;
    }
  }
}

module.exports = TelegramCoreService; 