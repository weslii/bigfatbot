const { v4: uuidv4 } = require('uuid');
const qrcode = require('qrcode');
const database = require('../../config/database');
const logger = require('../../utils/logger');
const ShortCodeGenerator = require('../../utils/shortCodeGenerator');
const RegistrationService = require('../RegistrationService');
const NotificationService = require('../NotificationService');

class TelegramSetupHandler {
  constructor(coreService) {
    this.core = coreService;
    this.pendingSetups = new Map();
  }

  async handleSetupCommand(message, chat, contact) {
    try {
      // Validate chat object
      if (!chat) {
        logger.error('Chat object is undefined in handleSetupCommand');
        return;
      }

      const chatId = chat.id.toString();

      // Only allow setup in groups
      if (chat.type !== 'group' && chat.type !== 'supergroup') {
        await this.core.sendMessage(chatId, '❌ Setup can only be done in Telegram groups.');
        return;
      }

      // Parse setup identifier from command
      const parts = message.text.split(' ');
      if (parts.length !== 2) {
        await this.core.sendMessage(chatId, '❌ Invalid setup command. Use: /setup <businessname-CODE>\n\nExample: /setup cakeshop-ABC123');
        return;
      }

      const setupIdentifier = parts[1];
      let business = null;

      // Find business by setup identifier
      business = await ShortCodeGenerator.findBusinessBySetupIdentifier(setupIdentifier);

      if (!business) {
        await this.core.sendMessage(chatId, '❌ Business not found. Please check your setup code.\n\nMake sure you\'re using the correct format: /setup businessname-CODE');
        return;
      }

      // Check if this group is already registered
      const existingGroup = await database.query('groups')
        .where('telegram_chat_id', chatId)
        .where('platform', 'telegram')
        .first();

      if (existingGroup) {
        await this.core.sendMessage(chatId, '❌ This group is already registered.');
        return;
      }

      // Check if this business already has both groups for Telegram
      const groupCount = await database.query('groups')
        .where('business_id', business.business_id)
        .where('platform', 'telegram')
        .whereNot('group_type', 'main')  // Exclude main groups from count
        .count('* as count')
        .first();

      if (groupCount.count >= 2) {
        await this.core.sendMessage(chatId, '❌ This business already has both Telegram groups registered.');
        return;
      }

      // Determine group type based on existing groups
      const existingGroups = await database.query('groups')
        .where('business_id', business.business_id)
        .where('platform', 'telegram')
        .whereNot('group_type', 'main')  // Exclude main groups from existing groups check
        .select('group_type');

      let groupType;
      if (existingGroups.length === 0) {
        // First group - ask user which type and store pending setup
        await this.core.sendMessage(chatId, 
          `🤖 *Business Setup*\n\nBusiness: ${business.business_name}\n\nIs this a sales group or delivery group?\n\nReply with "sales" or "delivery"`
        );
        
        // Store pending setup for this chat
        this.pendingSetups.set(chatId, {
          business: business,
          timestamp: Date.now()
        });
        
        // Clean up old pending setups (older than 10 minutes)
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        for (const [token, setup] of this.pendingSetups) {
          if (setup.timestamp < tenMinutesAgo) {
            this.pendingSetups.delete(token);
          }
        }
        
        return;
      } else if (existingGroups.length === 1) {
        // Second group - determine type based on existing group
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
            group_name: chat.title || chat.username || 'Telegram Group',
            group_id: chatId, // Store as group_id for compatibility
            telegram_chat_id: chatId,
            group_type: groupType,
            platform: 'telegram'
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
          await this.core.sendMessage(chatId, 
            `✅ *${groupType === 'sales' ? 'Sales' : 'Delivery'} Group Registered!*\n\n` +
            `*Business:* ${business.business_name}\n` +
            `*Group:* ${chat.title || chat.username}\n` +
            `*Type:* ${groupType}\n\n` +
            (groupType === 'sales' ? 
              '🛍️ Customers can now place orders in this group.' :
              '🚚 Delivery staff can manage orders in this group.')
          );

          logger.info('Telegram group registered successfully', {
            groupId: chatId,
            groupName: chat.title || chat.username,
            businessId: business.business_id,
            businessName: business.business_name,
            groupType
          });
          
          return; // Success, exit the retry loop
          
        } catch (error) {
          attempts++;
          
          // If it's a duplicate short code error and we haven't exceeded max attempts, try again with new short code
          if (error.code === '23505' && error.constraint && error.constraint.includes('short_code') && attempts < maxAttempts) {
            logger.warn(`Duplicate short code error, attempt ${attempts}/${maxAttempts}`);
            continue;
          }
          
          logger.error('Error registering Telegram group:', error);
          await this.core.sendMessage(chatId, '❌ Error registering group. Please try again.');
          return;
        }
      }
      
      // If we get here, all attempts failed
      await this.core.sendMessage(chatId, '❌ Failed to register group after multiple attempts. Please try again.');
      
    } catch (error) {
      logger.error('Error in handleSetupCommand for Telegram:', error);
      await this.core.sendMessage(chat.id, '❌ Error processing setup command. Please try again.');
    }
  }

  async generateGroupSetupQR(userId, businessName) {
    try {
      // For Telegram, we generate a bot invite link instead of QR code
      const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'your_bot_username';
      const inviteLink = `https://t.me/${botUsername}?start=setup_${businessName}`;
      
      // Generate QR code for the invite link
      const qrDataUrl = await qrcode.toDataURL(inviteLink);
      
      return {
        qr: qrDataUrl,
        inviteLink: inviteLink,
        instructions: [
          '1. Add the bot to your Telegram group',
          '2. Make the bot an admin in the group',
          '3. Use the command: /setup <businessname-CODE>',
          '4. Follow the setup instructions'
        ]
      };
    } catch (error) {
      logger.error('Error generating Telegram group setup QR:', error);
      throw error;
    }
  }

  async handleGroupJoin(groupId, groupName) {
    try {
      // For Telegram, this might be called when bot is added to a group
      logger.info('Bot joined Telegram group:', { groupId, groupName });
      
      // Send welcome message
      const welcomeMessage = 
        `🤖 *Welcome to Novi Business Bot!*\n\n` +
        `I'm here to help manage your business orders.\n\n` +
        `To get started:\n` +
        `1. Use /setup <businessname-CODE> to register this group\n` +
        `2. Make sure I have admin permissions\n` +
        `3. Start receiving orders!`;

      await this.core.sendMessage(groupId, welcomeMessage);
    } catch (error) {
      logger.error('Error handling Telegram group join:', error);
    }
  }

  findPendingSetup(groupId) {
    return this.pendingSetups.get(groupId) || null;
  }

  async completeSetup(setup) {
    try {
      // This method is called when setup is completed
      logger.info('Telegram setup completed:', setup);
      
      // Remove from pending setups
      this.pendingSetups.delete(setup.chatId);
      
      // Send completion notification
      await NotificationService.notifySuccess('Telegram group setup completed', {
        'Business': setup.business.business_name,
        'Group': setup.groupName,
        'Type': setup.groupType
      });
      
    } catch (error) {
      logger.error('Error completing Telegram setup:', error);
    }
  }

  async getSetupStatus(userId, businessName) {
    try {
      // Check if user has any Telegram groups for this business
      const groups = await database.query('groups')
        .where('user_id', userId)
        .where('business_name', businessName)
        .where('platform', 'telegram')
        .whereNot('group_type', 'main')
        .select('group_type', 'group_name', 'is_active');

      return {
        hasGroups: groups.length > 0,
        groups: groups,
        platform: 'telegram'
      };
    } catch (error) {
      logger.error('Error getting Telegram setup status:', error);
      return { hasGroups: false, groups: [], platform: 'telegram' };
    }
  }

  async handleSetupReply(message, chat, contact) {
    try {
      const chatId = chat.id.toString();
      const pendingSetup = this.pendingSetups.get(chatId);
      
      if (!pendingSetup) {
        return false; // No pending setup for this chat
      }

      const replyText = message.text.toLowerCase().trim();
      let groupType = null;

      if (replyText === 'sales') {
        groupType = 'sales';
      } else if (replyText === 'delivery') {
        groupType = 'delivery';
      } else {
        // Invalid reply
        await this.core.sendMessage(chatId, '❌ Please reply with "sales" or "delivery"');
        return true; // We handled this message
      }

      // Now register the group with the determined type
      const business = pendingSetup.business;
      
      // Check if this business already has a group of this type for Telegram
      const existingTypeGroup = await database.query('groups')
        .where('business_id', business.business_id)
        .where('platform', 'telegram')
        .where('group_type', groupType)
        .first();

      if (existingTypeGroup) {
        await this.core.sendMessage(chatId, `❌ This business already has a ${groupType} group on Telegram.`);
        this.pendingSetups.delete(chatId);
        return true;
      }

      // Register the group
      try {
        const insertData = {
          user_id: business.user_id,
          business_id: business.business_id,
          business_name: business.business_name,
          group_name: chat.title || chat.username || 'Telegram Group',
          group_id: chatId,
          telegram_chat_id: chatId,
          group_type: groupType,
          platform: 'telegram'
        };

        // Add short code to the first group
        if (business.setup_identifier) {
          const shortCode = business.setup_identifier.split('-').pop();
          insertData.short_code = shortCode;
        }

        await database.query('groups').insert(insertData);

        // Send confirmation
        await this.core.sendMessage(chatId, 
          `✅ *${groupType === 'sales' ? 'Sales' : 'Delivery'} Group Registered!*\n\n` +
          `*Business:* ${business.business_name}\n` +
          `*Group:* ${chat.title || chat.username}\n` +
          `*Type:* ${groupType}\n\n` +
          (groupType === 'sales' ? 
            '🛍️ Customers can now place orders in this group.' :
            '🚚 Delivery staff can manage orders in this group.')
        );

        // Complete the setup
        await this.completeSetup({
          chatId,
          business,
          groupName: chat.title || chat.username,
          groupType
        });

        // Remove from pending setups
        this.pendingSetups.delete(chatId);

        logger.info('Telegram group setup completed via reply', {
          groupId: chatId,
          groupName: chat.title || chat.username,
          businessId: business.business_id,
          businessName: business.business_name,
          groupType
        });

        return true; // We handled this message

      } catch (error) {
        logger.error('Error registering Telegram group via reply:', error);
        await this.core.sendMessage(chatId, '❌ Error registering group. Please try again.');
        return true; // We handled this message
      }

    } catch (error) {
      logger.error('Error handling Telegram setup reply:', error);
      return false;
    }
  }
}

module.exports = TelegramSetupHandler; 