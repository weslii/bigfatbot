const logger = require('../../utils/logger');
const NotificationService = require('../NotificationService');

class TelegramEventHandler {
  constructor(coreService) {
    this.core = coreService;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    if (!this.core.bot) return;

    // Bot lifecycle events
    this.core.bot.on('polling_start', () => {
      logger.info('Telegram polling started');
      this.core.isAuthenticated = true;
      this.core.storeConnectionStatus('connected', null);
    });

    this.core.bot.on('polling_stop', () => {
      logger.info('Telegram polling stopped');
      this.core.isAuthenticated = false;
      this.core.storeConnectionStatus('disconnected', null);
    });

    // Error events
    this.core.bot.on('polling_error', (error) => {
      logger.error('Telegram polling error:', error);
      this.core.isAuthenticated = false;
      this.core.storeConnectionStatus('error', null);
      
      // Send error notification
      NotificationService.notifyConnectionError(error, {
        'Platform': 'Telegram',
        'Component': 'Polling',
        'Action': 'Error'
      });
    });

    this.core.bot.on('webhook_error', (error) => {
      logger.error('Telegram webhook error:', error);
      this.core.isAuthenticated = false;
      this.core.storeConnectionStatus('error', null);
      
      // Send error notification
      NotificationService.notifyConnectionError(error, {
        'Platform': 'Telegram',
        'Component': 'Webhook',
        'Action': 'Error'
      });
    });

    this.core.bot.on('error', (error) => {
      logger.error('Telegram bot error:', error);
      this.core.isAuthenticated = false;
      this.core.storeConnectionStatus('error', null);
      
      // Send error notification
      NotificationService.notifyConnectionError(error, {
        'Platform': 'Telegram',
        'Component': 'Bot',
        'Action': 'Error'
      });
    });

    // Connection events
    this.core.bot.on('connected', () => {
      logger.info('Telegram bot connected');
      this.core.isAuthenticated = true;
      this.core.storeConnectionStatus('connected', null);
      
      // Send success notification
      NotificationService.notifyConnectionRestored({
        'Platform': 'Telegram',
        'Component': 'Bot',
        'Action': 'Connected'
      });
    });

    this.core.bot.on('disconnected', () => {
      logger.info('Telegram bot disconnected');
      this.core.isAuthenticated = false;
      this.core.storeConnectionStatus('disconnected', null);
      
      // Send disconnection notification
      NotificationService.notifyConnectionError(new Error('Telegram bot disconnected'), {
        'Platform': 'Telegram',
        'Component': 'Bot',
        'Action': 'Disconnected'
      });
    });

    // Group events
    this.core.bot.on('new_chat_members', (message) => {
      this.handleNewChatMembers(message);
    });

    this.core.bot.on('left_chat_member', (message) => {
      this.handleLeftChatMember(message);
    });

    this.core.bot.on('group_chat_created', (message) => {
      this.handleGroupChatCreated(message);
    });

    this.core.bot.on('supergroup_chat_created', (message) => {
      this.handleSupergroupChatCreated(message);
    });

    // Message events
    this.core.bot.on('edited_message', (message) => {
      this.handleEditedMessage(message);
    });

    this.core.bot.on('channel_post', (message) => {
      this.handleChannelPost(message);
    });

    this.core.bot.on('edited_channel_post', (message) => {
      this.handleEditedChannelPost(message);
    });

    // Callback query events
    this.core.bot.on('callback_query', (query) => {
      this.handleCallbackQuery(query);
    });

    // Inline query events
    this.core.bot.on('inline_query', (query) => {
      this.handleInlineQuery(query);
    });

    // Chosen inline result events
    this.core.bot.on('chosen_inline_result', (result) => {
      this.handleChosenInlineResult(result);
    });

    // Shipping query events
    this.core.bot.on('shipping_query', (query) => {
      this.handleShippingQuery(query);
    });

    // Pre-checkout query events
    this.core.bot.on('pre_checkout_query', (query) => {
      this.handlePreCheckoutQuery(query);
    });
  }

  async handleNewChatMembers(message) {
    try {
      const newMembers = message.new_chat_members;
      const chat = message.chat;
      
      // Check if bot was added to the group
      const botAdded = newMembers.some(member => member.is_bot && member.username === process.env.TELEGRAM_BOT_USERNAME);
      
      if (botAdded) {
        logger.info('Bot added to Telegram group:', {
          chatId: chat.id,
          chatTitle: chat.title,
          chatType: chat.type
        });

        // Send welcome message
        const welcomeMessage = 
          `🤖 *Welcome to Novi Business Bot!*\n\n` +
          `I'm here to help manage your business orders.\n\n` +
          `To get started:\n` +
          `1. Use /setup <businessname-CODE> to register this group\n` +
          `2. Make sure I have admin permissions\n` +
          `3. Start receiving orders!`;

        await this.core.sendMessage(chat.id, welcomeMessage);
      }
    } catch (error) {
      logger.error('Error handling new chat members:', error);
    }
  }

  async handleLeftChatMember(message) {
    try {
      const leftMember = message.left_chat_member;
      const chat = message.chat;
      
      // Check if bot was removed from the group
      if (leftMember.is_bot && leftMember.username === process.env.TELEGRAM_BOT_USERNAME) {
        logger.info('Bot removed from Telegram group:', {
          chatId: chat.id,
          chatTitle: chat.title
        });

        // Update group status in database
        const database = require('../../config/database');
        await database.query('groups')
          .where('telegram_chat_id', chat.id.toString())
          .where('platform', 'telegram')
          .update({ is_active: false });
      }
    } catch (error) {
      logger.error('Error handling left chat member:', error);
    }
  }

  async handleGroupChatCreated(message) {
    try {
      const chat = message.chat;
      logger.info('New Telegram group chat created:', {
        chatId: chat.id,
        chatTitle: chat.title
      });
    } catch (error) {
      logger.error('Error handling group chat created:', error);
    }
  }

  async handleSupergroupChatCreated(message) {
    try {
      const chat = message.chat;
      logger.info('New Telegram supergroup chat created:', {
        chatId: chat.id,
        chatTitle: chat.title
      });
    } catch (error) {
      logger.error('Error handling supergroup chat created:', error);
    }
  }

  async handleEditedMessage(message) {
    try {
      // Handle edited messages if needed
      logger.debug('Telegram message edited:', {
        messageId: message.message_id,
        chatId: message.chat.id,
        userId: message.from.id
      });
    } catch (error) {
      logger.error('Error handling edited message:', error);
    }
  }

  async handleChannelPost(message) {
    try {
      // Handle channel posts if needed
      logger.debug('Telegram channel post:', {
        messageId: message.message_id,
        chatId: message.chat.id
      });
    } catch (error) {
      logger.error('Error handling channel post:', error);
    }
  }

  async handleEditedChannelPost(message) {
    try {
      // Handle edited channel posts if needed
      logger.debug('Telegram edited channel post:', {
        messageId: message.message_id,
        chatId: message.chat.id
      });
    } catch (error) {
      logger.error('Error handling edited channel post:', error);
    }
  }

  async handleCallbackQuery(query) {
    try {
      // Handle callback queries if needed
      logger.debug('Telegram callback query:', {
        queryId: query.id,
        chatId: query.message?.chat?.id,
        userId: query.from.id,
        data: query.data
      });

      // Answer the callback query to remove loading state
      await this.core.bot.answerCallbackQuery(query.id);
    } catch (error) {
      logger.error('Error handling callback query:', error);
    }
  }

  async handleInlineQuery(query) {
    try {
      // Handle inline queries if needed
      logger.debug('Telegram inline query:', {
        queryId: query.id,
        userId: query.from.id,
        query: query.query
      });
    } catch (error) {
      logger.error('Error handling inline query:', error);
    }
  }

  async handleChosenInlineResult(result) {
    try {
      // Handle chosen inline results if needed
      logger.debug('Telegram chosen inline result:', {
        resultId: result.result_id,
        userId: result.from.id,
        query: result.query
      });
    } catch (error) {
      logger.error('Error handling chosen inline result:', error);
    }
  }

  async handleShippingQuery(query) {
    try {
      // Handle shipping queries if needed
      logger.debug('Telegram shipping query:', {
        queryId: query.id,
        userId: query.from.id
      });
    } catch (error) {
      logger.error('Error handling shipping query:', error);
    }
  }

  async handlePreCheckoutQuery(query) {
    try {
      // Handle pre-checkout queries if needed
      logger.debug('Telegram pre-checkout query:', {
        queryId: query.id,
        userId: query.from.id
      });
    } catch (error) {
      logger.error('Error handling pre-checkout query:', error);
    }
  }
}

module.exports = TelegramEventHandler; 