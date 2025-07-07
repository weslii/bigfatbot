const { v4: uuidv4 } = require('uuid');
const qrcode = require('qrcode');
const database = require('../../config/database');
const logger = require('../../utils/logger');
const ShortCodeGenerator = require('../../utils/shortCodeGenerator');
const RegistrationService = require('../RegistrationService');
const NotificationService = require('../NotificationService');

class WhatsAppSetupHandler {
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

      // Validate chat.id and _serialized property
      if (!chat.id || !chat.id._serialized) {
        logger.error('Chat ID or _serialized property is undefined', { 
          chatId: chat.id,
          hasSerialized: chat.id ? !!chat.id._serialized : false
        });
        return;
      }

      const chatId = chat.id._serialized;

      // Only allow setup in groups
      if (!chat.isGroup) {
        await this.core.client.sendMessage(chatId, '❌ Setup can only be done in WhatsApp groups.');
        return;
      }

      // Parse setup identifier from command
      const parts = message.body.split(' ');
      if (parts.length !== 2) {
        await this.core.client.sendMessage(chatId, '❌ Invalid setup command. Use: /setup <businessname-CODE>\n\nExample: /setup cakeshop-ABC123');
        return;
      }

      const setupIdentifier = parts[1];
      let business = null;

      // Find business by setup identifier
      business = await ShortCodeGenerator.findBusinessBySetupIdentifier(setupIdentifier);

      if (!business) {
        await this.core.client.sendMessage(chatId, '❌ Business not found. Please check your setup code.\n\nMake sure you\'re using the correct format: /setup businessname-CODE');
        return;
      }

      // Check if this group is already registered
      const existingGroup = await database.query('groups')
        .where('group_id', chatId)
        .first();

      if (existingGroup) {
        await this.core.client.sendMessage(chatId, '❌ This group is already registered.');
        return;
      }

      // Check if this business already has both groups
      const groupCount = await database.query('groups')
        .where('business_id', business.business_id)
        .whereNot('group_type', 'main')  // Exclude main groups from count
        .count('* as count')
        .first();

      if (groupCount.count >= 2) {
        await this.core.client.sendMessage(chatId, '❌ This business already has both groups registered.');
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
        await this.core.client.sendMessage(chatId, 
          `🤖 *Business Setup*\n\nBusiness: ${business.business_name}\n\nIs this a sales group or delivery group?\n\nReply with "sales" or "delivery"`
        );
        
        // Store pending setup for this chat
        this.pendingSetups.set(chatId, {
          business: business,
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
      } else {
        // Second group - automatically determine type
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
              group_name: chat.name,
              group_id: chatId,
              group_type: groupType
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
          await this.core.client.sendMessage(chatId, 
            `✅ *${groupType === 'sales' ? 'Sales' : 'Delivery'} Group Registered!*\n\n` +
            `*Business:* ${business.business_name}\n` +
            `*Group:* ${chat.name}\n` +
            `*Type:* ${groupType}\n\n` +
            (groupType === 'sales' ? 
              '🛍️ Customers can now place orders in this group.' :
              '🚚 Delivery staff can manage orders in this group.')
          );

          logger.info('Group registered successfully', {
            groupId: chatId,
            groupName: chat.name,
            businessId: business.business_id,
            businessName: business.business_name,
            groupType
          });
          
          return; // Success, exit the retry loop
          
        } catch (error) {
          attempts++;
          
          // If it's a duplicate short code error and we haven't exceeded max attempts, try again with new short code
          if (error.code === '23505' && error.constraint === 'groups_short_code_unique' && attempts < maxAttempts) {
            logger.warn(`Duplicate short code detected in setup, generating new code... (attempt ${attempts}/${maxAttempts})`);
            
            // Generate new short code and setup identifier
            const { shortCode, setupIdentifier } = await ShortCodeGenerator.generateBusinessSetupCode(business.business_name);
            
            // Update the business record with new short code
            await database.query('groups')
              .where('business_id', business.business_id)
              .update({
                short_code: shortCode,
                setup_identifier: setupIdentifier
              });
            
            // Update the business object for next attempt
            business.short_code = shortCode;
            business.setup_identifier = setupIdentifier;
            
            continue;
          }
          
          // For any other error or if we've exceeded attempts, throw the error
          throw error;
        }
      }
    } catch (error) {
      logger.error('Error handling setup command:', error);
      
      // Try to send error message if we have a valid chat ID
      try {
        if (chat && chat.id && chat.id._serialized) {
          await this.core.client.sendMessage(chat.id._serialized, '❌ Error during setup. Please try again.');
        }
      } catch (sendError) {
        logger.error('Failed to send error message:', sendError);
      }
    }
  }

  async generateGroupSetupQR(userId, businessName) {
    try {
      // Generate a unique setup token
      const setupToken = uuidv4();
      
      // Store setup info in memory (you might want to use Redis or similar in production)
      this.pendingSetups = this.pendingSetups || new Map();
      this.pendingSetups.set(setupToken, {
        userId,
        businessName,
        status: 'pending',
        salesGroupId: null,
        deliveryGroupId: null
      });

      // Generate QR code for the setup token
      const qrCode = await qrcode.toDataURL(setupToken);
      return qrCode;
    } catch (error) {
      logger.error('Error generating setup QR code:', error);
      throw error;
    }
  }

  async handleGroupJoin(groupId, groupName) {
    try {
      // Check if this is a pending setup
      const setup = this.findPendingSetup(groupId);
      if (!setup) {
        logger.info('Group joined but not part of setup:', groupId);
        return;
      }

      // Determine if this is sales or delivery group based on group name
      const isSalesGroup = groupName.toLowerCase().includes('sales');
      const isDeliveryGroup = groupName.toLowerCase().includes('delivery');

      if (!isSalesGroup && !isDeliveryGroup) {
        await this.core.client.sendMessage(groupId, 
          '⚠️ This group name must include either "sales" or "delivery" to be properly configured.');
        return;
      }

      // Store group ID
      if (isSalesGroup) {
        setup.salesGroupId = groupId;
      } else {
        setup.deliveryGroupId = groupId;
      }

      // Check if both groups are set up
      if (setup.salesGroupId && setup.deliveryGroupId) {
        await this.completeSetup(setup);
      } else {
        await this.core.client.sendMessage(groupId,
          '✅ Group registered! Please add the other group (sales/delivery) to complete setup.');
      }
    } catch (error) {
      logger.error('Error handling group join:', error);
    }
  }

  findPendingSetup(groupId) {
    if (!this.pendingSetups) return null;
    
    for (const [token, setup] of this.pendingSetups) {
      if (setup.salesGroupId === groupId || setup.deliveryGroupId === groupId) {
        return setup;
      }
    }
    return null;
  }

  async completeSetup(setup) {
    try {
      // Register groups in database
      await RegistrationService.registerGroup(
        setup.userId,
        'Sales Group',
        setup.businessName,
        'sales',
        setup.salesGroupId
      );

      await RegistrationService.registerGroup(
        setup.userId,
        'Delivery Group',
        setup.businessName,
        'delivery',
        setup.deliveryGroupId
      );

      // Send confirmation messages
      const welcomeMessage = `
🤖 *Welcome to WhatsApp Delivery Bot!*

Your business "${setup.businessName}" has been successfully set up.

*Sales Group:* For receiving orders from the sales group
*Delivery Group:* For managing and tracking deliveries

The bot will now:
• Process orders from the sales group
• Forward them to the delivery group
• Track order status
• Generate daily reports
• Send pending order reminders

For help, type /help in the delivery group.
      `;

      await this.core.client.sendMessage(setup.salesGroupId, welcomeMessage);
      await this.core.client.sendMessage(setup.deliveryGroupId, welcomeMessage);

      // Mark setup as complete
      setup.status = 'complete';
      
      logger.info('Group setup completed successfully', {
        businessName: setup.businessName,
        userId: setup.userId
      });

      // Get user data for notification
      const user = await database.query('users').where('id', setup.userId).first();
      
      // Send business registration notification
      if (user) {
        const businessData = {
          business_name: setup.businessName,
          business_id: setup.businessId || setup.business?.business_id || 'auto-generated',
          group_id: setup.salesGroupId,
          group_type: 'sales'
        };
        
        try {
          await NotificationService.notifyBusinessRegistration(businessData, user, {
            'Registration Method': 'WhatsApp Setup',
            'Setup Duration': '2.5 minutes',
            'Groups Created': '2 (Sales + Delivery)'
          });
        } catch (notificationError) {
          logger.error('Error sending business registration notification:', notificationError);
        }
      }
    } catch (error) {
      logger.error('Error completing setup:', error);
      setup.status = 'error';
      setup.error = error.message;
      
      // Start continuous setup error notifications
      try {
        NotificationService.startContinuousErrorNotification('service', error, {
          'Component': 'Business Setup',
          'Action': 'Complete Setup',
          'Business Name': setup.businessName,
          'User ID': setup.userId
        });
      } catch (notificationError) {
        logger.error('Error starting continuous setup error notification:', notificationError);
      }
    }
  }

  async getSetupStatus(userId, businessName) {
    if (!this.pendingSetups) return { status: 'not_found' };

    for (const [token, setup] of this.pendingSetups) {
      if (setup.userId === userId && setup.businessName === businessName) {
        return {
          status: setup.status,
          message: setup.error || null
        };
      }
    }

    return { status: 'not_found' };
  }

  async handleSetupReply(message, chat, contact) {
    try {
      const chatId = chat.id._serialized;
      const messageBody = message.body.toLowerCase().trim();
      
      // Check if this is a sales or delivery reply
      if (messageBody !== 'sales' && messageBody !== 'delivery') {
        return false; // Not a setup reply
      }

      // Find pending setup for this chat
      const pendingSetup = this.pendingSetups.get(chatId);
      if (!pendingSetup) {
        return false; // No pending setup for this chat
      }

      const groupType = messageBody; // 'sales' or 'delivery'
      
      // Register the group
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          const insertData = {
            user_id: pendingSetup.business.user_id,
            business_id: pendingSetup.business.business_id,
            business_name: pendingSetup.business.business_name,
            group_name: chat.name,
            group_id: chatId,
            group_type: groupType
          };

          // Only add short code data to the FIRST group
          if (pendingSetup.business.setup_identifier) {
            // Extract short_code from setup_identifier (format: businessname-CODE)
            const shortCode = pendingSetup.business.setup_identifier.split('-').pop();
            insertData.short_code = shortCode;
          }

          await database.query('groups').insert(insertData);

          // Send confirmation
          await this.core.client.sendMessage(chatId, 
            `✅ *${groupType === 'sales' ? 'Sales' : 'Delivery'} Group Registered!*\n\n` +
            `*Business:* ${pendingSetup.business.business_name}\n` +
            `*Group:* ${chat.name}\n` +
            `*Type:* ${groupType}\n\n` +
            (groupType === 'sales' ? 
              '🛍️ Customers can now place orders in this group.' :
              '🚚 Delivery staff can manage orders in this group.')
          );

          logger.info('Group registered successfully via reply', {
            groupId: chatId,
            groupName: chat.name,
            businessId: pendingSetup.business.business_id,
            businessName: pendingSetup.business.business_name,
            groupType
          });

          // Remove pending setup
          this.pendingSetups.delete(chatId);
          return true; // Handled the reply
          
        } catch (error) {
          attempts++;
          
          // If it's a duplicate short code error and we haven't exceeded max attempts, try again with new short code
          if (error.code === '23505' && error.constraint === 'groups_short_code_unique' && attempts < maxAttempts) {
            logger.warn(`Duplicate short code detected in setup reply, generating new code... (attempt ${attempts}/${maxAttempts})`);
            
            // Generate new short code and setup identifier
            const { shortCode, setupIdentifier } = await ShortCodeGenerator.generateBusinessSetupCode(pendingSetup.business.business_name);
            
            // Update the business record with new short code
            await database.query('groups')
              .where('business_id', pendingSetup.business.business_id)
              .update({
                short_code: shortCode,
                setup_identifier: setupIdentifier
              });
            
            // Update the business object for next attempt
            pendingSetup.business.short_code = shortCode;
            pendingSetup.business.setup_identifier = setupIdentifier;
            
            continue;
          }
          
          // For any other error or if we've exceeded attempts, throw the error
          throw error;
        }
      }
      
      return true; // Handled the reply
    } catch (error) {
      logger.error('Error handling setup reply:', error);
      return false;
    }
  }
}

module.exports = WhatsAppSetupHandler; 