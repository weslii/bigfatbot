const logger = require('../../utils/logger');
const NotificationService = require('../NotificationService');

class TelegramEventHandler {
  constructor(coreService, setupHandler = null) {
    this.core = coreService;
    this.setupHandler = setupHandler;
    this.handlersSetup = false;
    // Don't set up handlers immediately - wait for bot to be initialized
  }

  setupHandlers() {
    if (!this.core.bot) {
      logger.debug('Telegram bot not initialized for event handler - will set up later');
      return;
    }

    if (this.handlersSetup) {
      logger.debug('Telegram event handlers already set up');
      return;
    }

    logger.info('Setting up Telegram event handlers...');

    // Handle polling errors
    this.core.bot.on('polling_error', async (error) => {
      logger.error('Telegram polling error:', error);
      this.core.isAuthenticated = false;
      
      // Store connection status in database
      await this.core.storeConnectionStatus('polling_error', null);
      
      // Start continuous error notification
      try {
        NotificationService.startContinuousErrorNotification('connection', error, {
          'Component': 'Telegram Bot',
          'Error Type': 'Polling Error',
          'Time': new Date().toISOString()
        });
      } catch (notificationError) {
        logger.error('Error starting continuous polling error notification:', notificationError);
      }
    });

    // Handle webhook errors
    this.core.bot.on('webhook_error', async (error) => {
      logger.error('Telegram webhook error:', error);
      
      // Start continuous error notification
      try {
        NotificationService.startContinuousErrorNotification('connection', error, {
          'Component': 'Telegram Bot',
          'Error Type': 'Webhook Error',
          'Time': new Date().toISOString()
        });
      } catch (notificationError) {
        logger.error('Error starting continuous webhook error notification:', notificationError);
      }
    });

    // Handle bot info updates
    this.core.bot.on('bot_info', async (botInfo) => {
      logger.info('Telegram bot info updated:', botInfo);
      this.core.botInfo = botInfo;
      this.core.isAuthenticated = true;
      
      // Store connection status
      await this.core.storeConnectionStatus('connected', botInfo.username);
      
      // Send connection restored notification
      try {
        await NotificationService.notifyConnectionRestored({
          'Reconnection Time': 'Immediate',
          'Previous Status': 'Disconnected',
          'Bot Username': botInfo.username
        });
      } catch (notificationError) {
        logger.error('Error sending connection restored notification:', notificationError);
      }
    });

    // Handle error events
    this.core.bot.on('error', async (error) => {
      logger.error('Telegram bot error:', error);
      
      // Start continuous error notification
      try {
        NotificationService.startContinuousErrorNotification('service', error, {
          'Component': 'Telegram Bot',
          'Error Type': 'General Error',
          'Time': new Date().toISOString()
        });
      } catch (notificationError) {
        logger.error('Error starting continuous general error notification:', notificationError);
      }
    });

    // Note: Message handling is done by TelegramMessageHandler
    // We don't set up a message handler here to avoid conflicts

    // Handle edited messages
    this.core.bot.on('edited_message', (msg) => {
      logger.debug('Telegram edited message received:', {
        messageId: msg.message_id,
        chatId: msg.chat.id,
        from: msg.from?.username || msg.from?.first_name,
        text: msg.text?.substring(0, 100) + (msg.text?.length > 100 ? '...' : '')
      });
    });

    // Handle callback queries (for inline keyboards)
    this.core.bot.on('callback_query', async (query) => {
      logger.debug('Telegram callback query received:', {
        queryId: query.id,
        chatId: query.message?.chat?.id,
        data: query.data
      });

      // Handle setup callback queries
      if (this.setupHandler && query.data) {
        try {
          await this.setupHandler.handleCallbackQuery(query);
        } catch (error) {
          logger.error('Error handling callback query:', error);

          // Answer the callback query with an error
          try {
            await this.core.bot.answerCallbackQuery(query.id, 'Error processing request');
          } catch (answerError) {
            logger.error('Error answering callback query:', answerError);
          }
        }
      }
    });

    this.handlersSetup = true;
    logger.info('Telegram event handlers set up successfully');
  }

  // Method to be called after bot is initialized
  initializeHandlers() {
    if (this.core.bot && !this.handlersSetup) {
      this.setupHandlers();
    }
  }

  // Method to handle bot disconnection
  async handleDisconnection(reason = 'Unknown') {
    logger.warn('Telegram bot disconnected:', reason);
    this.core.isAuthenticated = false;
    
    // Store connection status
    await this.core.storeConnectionStatus('disconnected', null);
    
    // Start continuous connection error notifications
    try {
      const disconnectError = new Error(`Telegram bot disconnected: ${reason}`);
      NotificationService.startContinuousErrorNotification('connection', disconnectError, {
        'Disconnect Reason': reason,
        'Last Connected': new Date().toISOString()
      });
    } catch (notificationError) {
      logger.error('Error starting continuous connection error notification:', notificationError);
    }
  }

  // Method to handle bot reconnection
  async handleReconnection() {
    logger.info('Telegram bot reconnected');
    this.core.isAuthenticated = true;
    
    // Store connection status
    await this.core.storeConnectionStatus('connected', this.core.botInfo?.username);
    
    // Send connection restored notification
    try {
      await NotificationService.notifyConnectionRestored({
        'Reconnection Time': 'Automatic',
        'Previous Status': 'Disconnected',
        'Bot Username': this.core.botInfo?.username
      });
    } catch (notificationError) {
      logger.error('Error sending connection restored notification:', notificationError);
    }
  }
}

module.exports = TelegramEventHandler; 