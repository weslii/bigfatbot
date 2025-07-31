const database = require('../../config/database');
const logger = require('../../utils/logger');
const RegistrationService = require('../RegistrationService');
const NotificationService = require('../NotificationService');
const crypto = require('crypto');

class TelegramSetupHandler {
  constructor(coreService) {
    this.core = coreService;
    this.pendingSetups = new Map(); // Store pending setups with cleanup
  }

  async handleSetupCommand(message, chatId, sender) {
    try {
      logger.info('Telegram setup command received:', {
        messageText: message.text,
        chatId: chatId,
        sender: sender.username || sender.first_name
      });

      const messageText = message.text || '';
      const parts = messageText.split(' ');
      
      if (parts.length !== 2) {
        await this.core.sendMessage(chatId, 
          '❌ Invalid setup command format.\n\n' +
          'Usage: /setup <businessname-CODE>\n\n' +
          'Example: /setup cakeshop-ABC123\n' +
          'Example: /setup telegramtest-JAW066'
        );
        return;
      }

      const setupIdentifier = parts[1];
      let business = null;

      // Find business by setup identifier
      const ShortCodeGenerator = require('../../utils/shortCodeGenerator');
      business = await ShortCodeGenerator.findBusinessBySetupIdentifier(setupIdentifier);

      if (!business) {
        await this.core.sendMessage(chatId, 
          '❌ Business not found. Please check your setup code.\n\n' +
          'Make sure you\'re using the correct format: /setup businessname-CODE'
        );
        return;
      }

      // Check if this group is already registered
      const existingGroup = await database.query('groups')
        .where('group_id', chatId.toString())
        .first();

      if (existingGroup) {
        await this.core.sendMessage(chatId, '❌ This group is already registered.');
        return;
      }

      // Check if this business already has both groups
      const groupCount = await database.query('groups')
        .where('business_id', business.business_id)
        .whereNot('group_type', 'main')  // Exclude main groups from count
        .count('* as count')
        .first();

      if (groupCount.count >= 2) {
        await this.core.sendMessage(chatId, '❌ This business already has both groups registered.');
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
        await this.core.sendMessage(chatId, 
          `🤖 *Business Setup*\n\nBusiness: ${business.business_name}\n\nIs this a sales group or delivery group?\n\nReply with "sales" or "delivery"`
        );
        
        // Store pending setup for this chat
        this.pendingSetups.set(chatId.toString(), {
          business: business,
          senderId: sender.id,
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
      } else if (existingGroups.length === 1) {
        // Second group - determine the missing type
        const existingType = existingGroups[0].group_type;
        groupType = existingType === 'sales' ? 'delivery' : 'sales';
        
        // Complete setup directly
        await this.completeSetup({
          chatId: chatId.toString(),
          business: business,
          groupType: groupType,
          senderId: sender.id,
          senderName: sender.first_name + (sender.last_name ? ' ' + sender.last_name : '')
        });
        
        return;
      }

      // Generate unique setup token
      const setupToken = crypto.randomBytes(16).toString('hex');
      
      // Store setup information
      this.pendingSetups.set(setupToken, {
        chatId: chatId.toString(),
        businessName,
        groupType,
        senderId: sender.id,
        senderName: sender.first_name + (sender.last_name ? ' ' + sender.last_name : ''),
        createdAt: Date.now()
      });

      // Create setup message with inline keyboard
      const setupMessage = this.createSetupMessage(businessName, groupType, setupToken);
      await this.core.sendMessage(chatId, setupMessage, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Confirm Setup', callback_data: `setup_confirm_${setupToken}` },
              { text: '❌ Cancel', callback_data: `setup_cancel_${setupToken}` }
            ]
          ]
        }
      });

      logger.info(`Setup initiated for ${businessName} (${groupType}) in chat ${chatId}`);
    } catch (error) {
      logger.error('Error handling setup command:', error);
      await this.core.sendMessage(chatId, '❌ Error processing setup command. Please try again.');
    }
  }

  async handleSetupReply(message, chatId, sender) {
    try {
      const messageText = message.text || '';
      
      // Check if there's a pending setup for this chat
      const pendingSetup = this.pendingSetups.get(chatId.toString());
      
      if (pendingSetup) {
        // Check if the reply is from the original setup initiator
        if (sender.id !== pendingSetup.senderId) {
          await this.core.sendMessage(chatId, 
            '❌ Only the person who initiated the setup can complete it.'
          );
          return true;
        }

        // Process the group type reply
        const groupType = messageText.toLowerCase().trim();
        
        if (!['sales', 'delivery'].includes(groupType)) {
          await this.core.sendMessage(chatId, 
            '❌ Invalid group type. Please reply with "sales" or "delivery".'
          );
          return true;
        }

        // Complete the setup
        await this.completeSetup({
          chatId: chatId.toString(),
          business: pendingSetup.business,
          groupType: groupType,
          senderId: sender.id,
          senderName: sender.first_name + (sender.last_name ? ' ' + sender.last_name : '')
        });

        // Clean up pending setup
        this.pendingSetups.delete(chatId.toString());
        
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Error handling setup reply:', error);
      return false;
    }
  }



  async handleCallbackQuery(query) {
    try {
      const data = query.data;
      const chatId = query.message.chat.id;
      
      if (data.startsWith('setup_confirm_')) {
        const setupToken = data.replace('setup_confirm_', '');
        const setup = this.pendingSetups.get(setupToken);
        
        if (setup && setup.chatId === chatId.toString()) {
          await this.completeSetup(setup);
          this.pendingSetups.delete(setupToken);
          
          // Answer callback query
          await this.core.bot.answerCallbackQuery(query.id, 'Setup completed successfully!');
          
          // Edit the original message
          await this.core.bot.editMessageText(
            '✅ Setup completed successfully!\n\n' +
            `Business: ${setup.businessName}\n` +
            `Group Type: ${setup.groupType}\n` +
            `Group ID: ${chatId}`,
            {
              chat_id: chatId,
              message_id: query.message.message_id
            }
          );
        }
      } else if (data.startsWith('setup_cancel_')) {
        const setupToken = data.replace('setup_cancel_', '');
        const setup = this.pendingSetups.get(setupToken);
        
        if (setup && setup.chatId === chatId.toString()) {
          this.pendingSetups.delete(setupToken);
          
          // Answer callback query
          await this.core.bot.answerCallbackQuery(query.id, 'Setup cancelled.');
          
          // Edit the original message
          await this.core.bot.editMessageText(
            '❌ Setup cancelled.',
            {
              chat_id: chatId,
              message_id: query.message.message_id
            }
          );
        }
      }
    } catch (error) {
      logger.error('Error handling callback query:', error);
    }
  }

  async completeSetup(setup) {
    try {
      const { business, groupType, chatId, senderId, senderName } = setup;
      
      // Get the user who owns this business
      const businessOwner = await database.query('groups')
        .where('business_id', business.business_id)
        .where('group_type', 'main')
        .select('user_id')
        .first();

      if (!businessOwner) {
        await this.core.sendMessage(chatId, '❌ Error: Business owner not found.');
        return;
      }

      // Create the group record
      const groupData = {
        user_id: businessOwner.user_id,
        group_id: chatId,
        business_id: business.business_id,
        business_name: business.business_name,
        group_name: `Telegram ${groupType} group`,
        group_type: groupType,
        platform: 'telegram',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      };

      await database.query('groups').insert(groupData);
      
      logger.info(`Created Telegram group: ${chatId} for business: ${business.business_name} (${groupType})`);

      // Send success message
      await this.core.sendMessage(chatId, 
        `✅ *Setup Completed Successfully!*\n\n` +
        `Business: ${business.business_name}\n` +
        `Group Type: ${groupType}\n` +
        `Platform: Telegram\n\n` +
        `Your group is now ready to receive orders!`
      );

      // Notify admin (if configured)
      try {
        await NotificationService.sendSetupNotification({
          businessName: business.business_name,
          groupType: groupType,
          platform: 'telegram',
          groupId: chatId,
          senderName: senderName
        });
      } catch (error) {
        logger.error('Error sending setup notification:', error);
      }

    } catch (error) {
      logger.error('Error completing setup:', error);
      await this.core.sendMessage(chatId, '❌ Error completing setup. Please try again.');
    }
  }

  createSetupMessage(businessName, groupType, setupToken) {
    return `🔧 **Group Setup Request**\n\n` +
           `📋 Business Name: ${businessName}\n` +
           `📝 Group Type: ${groupType}\n` +
           `🆔 Group ID: ${setupToken}\n\n` +
           `Please confirm this setup by clicking the button below or replying with "confirm".\n\n` +
           `⚠️ **Important:** Only the person who initiated this setup can confirm it.`;
  }

  generateShortCode(businessName) {
    // Generate a short code from business name
    const words = businessName.split(' ');
    if (words.length >= 2) {
      return words.map(word => word.charAt(0).toUpperCase()).join('').substring(0, 3);
    } else {
      return businessName.substring(0, 3).toUpperCase();
    }
  }

  async getSetupStatus(chatId) {
    try {
      const group = await database.query('groups')
        .where('group_id', chatId.toString())
        .first();

      if (group) {
        const business = await database.query('businesses')
          .where('id', group.business_id)
          .first();

        return {
          isSetup: true,
          businessName: business?.name,
          groupType: group.group_type,
          isActive: group.is_active
        };
      }

      return {
        isSetup: false,
        businessName: null,
        groupType: null,
        isActive: false
      };
    } catch (error) {
      logger.error('Error getting setup status:', error);
      return {
        isSetup: false,
        businessName: null,
        groupType: null,
        isActive: false
      };
    }
  }

  // Cleanup old pending setups
  cleanupOldSetups() {
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    for (const [token, setup] of this.pendingSetups) {
      if (setup.createdAt && setup.createdAt < twoHoursAgo) {
        this.pendingSetups.delete(token);
        logger.info('Cleaned up old pending setup:', token);
      }
    }
  }
}

module.exports = TelegramSetupHandler; 