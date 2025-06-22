const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const database = require('../config/database');
const logger = require('../utils/logger');
const RegistrationService = require('./RegistrationService');
const OrderService = require('./OrderService');
const MessageService = require('./MessageService');
const OrderParser = require('./OrderParser');
const ShortCodeGenerator = require('../utils/shortCodeGenerator');

class WhatsAppService {
  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--memory-pressure-off',
          '--no-default-browser-check',
          '--disable-default-apps',
          '--disable-sync',
          '--disable-translate',
          '--hide-scrollbars',
          '--mute-audio'
        ],
        defaultViewport: { width: 1024, height: 768 },
        timeout: 60000,
        protocolTimeout: 60000
      },
      qrMaxRetries: 10,
      qrRefreshInterval: 60000, // 60 seconds between QR refreshes
      qrQualityOptions: {
        quality: 0.8,
        margin: 4,
        scale: 8,
        errorCorrectionLevel: 'H'
      },
    });

    this.client.on('qr', async (qr) => {
      try {
        // Convert QR code to data URL
        const qrDataUrl = await qrcode.toDataURL(qr, {
          errorCorrectionLevel: 'H',
          margin: 4,
          scale: 8
        });
        
        // Log the QR code as a data URL that can be viewed in a browser
        logger.info('=== NEW QR CODE GENERATED ===');
        logger.info('Please scan this QR code using WhatsApp mobile app.');
        logger.info('You have 30 seconds to scan before a new code is generated.');
        logger.info('To view the QR code, copy this URL and open it in a browser:');
        logger.info(qrDataUrl);
        logger.info('================================');
      } catch (error) {
        logger.error('Error generating QR code:', error);
      }
    });

    this.client.on('ready', () => {
      logger.info('WhatsApp client is ready');
    });

    this.client.on('authenticated', () => {
      logger.info('WhatsApp client is authenticated');
    });

    this.client.on('auth_failure', (error) => {
      logger.error('WhatsApp authentication failed:', error);
    });

    this.client.on('disconnected', (reason) => {
      logger.warn('WhatsApp client disconnected:', reason);
    });

    this.client.on('message', this.handleMessage.bind(this));
  }

  async start() {
    try {
      await this.client.initialize();
      logger.info('WhatsApp service started successfully');
    } catch (error) {
      logger.error('Failed to start WhatsApp service:', error);
      throw error;
    }
  }

  async stop() {
    try {
      await this.client.destroy();
      logger.info('WhatsApp service stopped successfully');
    } catch (error) {
      logger.error('Failed to stop WhatsApp service:', error);
      throw error;
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

  async handleMessage(message) {
    try {
      const chat = await message.getChat();
      const contact = await message.getContact();
      
      // Handle setup command FIRST (before checking if group is registered)
      if (message.body.startsWith('/setup')) {
        await this.handleSetupCommand(message, chat, contact);
        return;
      }

      // Get group info (only for non-setup messages)
      const group = await database.query('groups')
        .where('group_id', message.from)
        .first();

      if (!group) {
        logger.info('Message from unknown group:', message.from);
        return;
      }

      // Get delivery group info
      const deliveryGroup = await database.query('delivery_groups')
        .where('group_id', group.delivery_group_id)
        .first();

      // Get group info from database
      const groupInfo = group;
      
      // Handle sales group messages (new orders)
      if (groupInfo.group_type === 'sales') {
        await this.handleSalesGroupMessage(message, contact, groupInfo);
      }
      
      // Handle delivery group messages (commands and replies)
      else if (groupInfo.group_type === 'delivery') {
        await this.handleDeliveryGroupMessage(message, contact, groupInfo);
      }
    } catch (error) {
      logger.error('Error handling message:', error);
    }
  }

  async handleSalesGroupMessage(message, contact, groupInfo) {
    try {
      // Skip if message is from bot itself
      if (contact.isMe) return;

      const orderData = OrderParser.parseOrder(message.body, contact.name || contact.number);
      
      if (orderData) {
        // Add business_id to order data
        orderData.business_id = groupInfo.business_id;
        
        const order = await OrderService.createOrder(groupInfo.business_id, orderData);
        const deliveryConfirmation = MessageService.formatOrderConfirmation(order);
        const salesConfirmation = MessageService.formatSalesConfirmation(order);
        
        // Get delivery group for this business
        const deliveryGroup = await database.query('groups')
          .where('business_id', groupInfo.business_id)
          .where('group_type', 'delivery')
          .first();

        if (deliveryGroup) {
          // Send detailed confirmation to delivery group
          await this.client.sendMessage(deliveryGroup.group_id, deliveryConfirmation);
        }
        
        // Send simplified confirmation to sales group
        await this.client.sendMessage(groupInfo.group_id, salesConfirmation);
        
        logger.info('Order processed and confirmations sent', { 
          orderId: order.id,
          businessId: groupInfo.business_id,
          customerName: orderData.customer_name,
          items: orderData.items
        });
      } else {
        // Enhanced error message for failed parsing
        logger.warn('Order parsing failed', { 
          messageBody: message.body.substring(0, 100) + '...',
          senderName: contact.name || contact.number,
          businessId: groupInfo.business_id
        });
        
        // Only send error message if it looks like an order attempt
        if (message.body.length > 20 && !message.body.startsWith('/')) {
          await this.client.sendMessage(groupInfo.group_id, 
            '❌ Could not process order. Please ensure your message includes:\n' +
            '• Customer name\n' +
            '• Phone number\n' +
            '• Delivery address\n' +
            '• Order items\n\n' +
            'Example format:\n' +
            'John Doe\n' +
            '08012345678\n' +
            '123 Lekki Phase 1, Lagos\n' +
            '2 Cakes, 1 Pizza'
          );
        }
      }
    } catch (error) {
      logger.error('Error handling sales group message:', error);
    }
  }

  async handleDeliveryGroupMessage(message, contact, groupInfo) {
    try {
      // Skip if message is from bot itself
      if (contact.isMe) return;

      const messageBody = message.body.toLowerCase().trim();
      const senderName = contact.name || contact.number;

      // Handle reply-based completion
      if (message.hasQuotedMsg && messageBody === 'done') {
        await this.handleReplyCompletion(message, senderName, groupInfo);
      }
      // Handle reply-based cancellation
      else if (message.hasQuotedMsg && messageBody === 'cancel') {
        await this.handleReplyCancellation(message, senderName, groupInfo);
      }
      // Handle command-based operations
      else if (messageBody.startsWith('done #')) {
        const orderId = messageBody.replace('done #', '').trim();
        await this.markOrderAsDelivered(orderId, senderName, groupInfo);
      }
      else if (messageBody.startsWith('cancel #')) {
        const orderId = messageBody.replace('cancel #', '').trim();
        await this.cancelOrder(orderId, senderName, groupInfo);
      }
      // Handle report commands
      else if (messageBody === '/daily') {
        await this.sendDailyReport(groupInfo);
      }
      else if (messageBody === '/pending') {
        await this.sendPendingOrders(groupInfo);
      }
      else if (messageBody === '/weekly') {
        await this.sendWeeklyReport(groupInfo);
      }
      else if (messageBody === '/monthly') {
        await this.sendMonthlyReport(groupInfo);
      }
      else if (messageBody === '/help') {
        await this.sendHelpMessage(groupInfo);
      }
    } catch (error) {
      logger.error('Error handling delivery group message:', error);
    }
  }

  async handleReplyCompletion(message, senderName, groupInfo) {
    try {
      const quotedMessage = await message.getQuotedMessage();
      const orderId = this.extractOrderIdFromMessage(quotedMessage.body);
      
      if (orderId) {
        await this.markOrderAsDelivered(orderId, senderName, groupInfo);
      }
    } catch (error) {
      logger.error('Error handling reply completion:', error);
    }
  }

  async handleReplyCancellation(message, senderName, groupInfo) {
    try {
      const quotedMessage = await message.getQuotedMessage();
      const orderId = this.extractOrderIdFromMessage(quotedMessage.body);
      
      if (orderId) {
        await this.cancelOrder(orderId, senderName, groupInfo);
      }
    } catch (error) {
      logger.error('Error handling reply cancellation:', error);
    }
  }

  async markOrderAsDelivered(orderId, deliveryPerson, groupInfo) {
    try {
      const order = await OrderService.getOrderById(orderId, groupInfo.business_id);
      
      if (!order) {
        await this.client.sendMessage(groupInfo.group_id, `❌ Order #${orderId} not found.`);
        return;
      }

      if (order.status === 'delivered') {
        await this.client.sendMessage(groupInfo.group_id, `ℹ️ Order #${orderId} is already marked as delivered.`);
        return;
      }

      if (order.status === 'cancelled') {
        await this.client.sendMessage(groupInfo.group_id, `❌ Cannot mark cancelled order #${orderId} as delivered.`);
        return;
      }

      await OrderService.updateOrderStatus(orderId, 'delivered', deliveryPerson, groupInfo.business_id);
      await this.client.sendMessage(groupInfo.group_id, `✅ Order #${orderId} marked as delivered by ${deliveryPerson}.`);
      
      logger.info('Order marked as delivered', { orderId, deliveryPerson, businessId: groupInfo.business_id });
    } catch (error) {
      logger.error('Error marking order as delivered:', error);
      await this.client.sendMessage(groupInfo.group_id, `❌ Error updating order #${orderId}. Please try again.`);
    }
  }

  async cancelOrder(orderId, cancelledBy, groupInfo) {
    try {
      const order = await OrderService.getOrderById(orderId, groupInfo.business_id);
      
      if (!order) {
        await this.client.sendMessage(groupInfo.group_id, `❌ Order #${orderId} not found.`);
        return;
      }

      if (order.status === 'cancelled') {
        await this.client.sendMessage(groupInfo.group_id, `ℹ️ Order #${orderId} is already cancelled.`);
        return;
      }

      if (order.status === 'delivered') {
        await this.client.sendMessage(groupInfo.group_id, `❌ Cannot cancel delivered order #${orderId}.`);
        return;
      }

      await OrderService.updateOrderStatus(orderId, 'cancelled', cancelledBy, groupInfo.business_id);
      await this.client.sendMessage(groupInfo.group_id, `❌ Order #${orderId} cancelled by ${cancelledBy}.`);
      
      logger.info('Order cancelled', { orderId, cancelledBy, businessId: groupInfo.business_id });
    } catch (error) {
      logger.error('Error cancelling order:', error);
      await this.client.sendMessage(groupInfo.group_id, `❌ Error cancelling order #${orderId}. Please try again.`);
    }
  }

  async sendHelpMessage(groupInfo) {
    try {
      const message = MessageService.formatHelpMessage();
      await this.client.sendMessage(groupInfo.group_id, message);
    } catch (error) {
      logger.error('Error sending help message:', error);
    }
  }

  async sendDailyReport(groupInfo) {
    try {
      const report = await OrderService.getDailyReport(groupInfo.business_id);
      const message = MessageService.formatDailyReport(report, new Date());
      await this.client.sendMessage(groupInfo.group_id, message);
    } catch (error) {
      logger.error('Error sending daily report:', error);
      await this.client.sendMessage(groupInfo.group_id, '❌ Error generating daily report.');
    }
  }

  async sendPendingOrders(groupInfo) {
    try {
      const orders = await OrderService.getPendingOrders(groupInfo.business_id);
      const message = MessageService.formatPendingOrders(orders);
      await this.client.sendMessage(groupInfo.group_id, message);
    } catch (error) {
      logger.error('Error sending pending orders:', error);
      await this.client.sendMessage(groupInfo.group_id, '❌ Error retrieving pending orders.');
    }
  }

  async sendWeeklyReport(groupInfo) {
    try {
      const report = await OrderService.getWeeklyReport(groupInfo.business_id);
      const message = MessageService.formatWeeklyReport(report);
      await this.client.sendMessage(groupInfo.group_id, message);
    } catch (error) {
      logger.error('Error sending weekly report:', error);
      await this.client.sendMessage(groupInfo.group_id, '❌ Error generating weekly report.');
    }
  }

  async sendMonthlyReport(groupInfo) {
    try {
      const report = await OrderService.getMonthlyReport(groupInfo.business_id);
      const message = MessageService.formatMonthlyReport(report);
      await this.client.sendMessage(groupInfo.group_id, message);
    } catch (error) {
      logger.error('Error sending monthly report:', error);
      await this.client.sendMessage(groupInfo.group_id, '❌ Error generating monthly report.');
    }
  }

  async handleSetupCommand(message, chat, contact) {
    try {
      // Only allow setup in groups
      if (!chat.isGroup) {
        await this.client.sendMessage(chat.id._serialized, '❌ Setup can only be done in WhatsApp groups.');
        return;
      }

      // Parse setup identifier from command
      const parts = message.body.split(' ');
      if (parts.length !== 2) {
        await this.client.sendMessage(chat.id._serialized, '❌ Invalid setup command. Use: /setup <businessname-CODE>\n\nExample: /setup cakeshop-ABC123');
        return;
      }

      const setupIdentifier = parts[1];
      let business = null;

      // First try to find by setup identifier (new format)
      business = await ShortCodeGenerator.findBusinessBySetupIdentifier(setupIdentifier);

      // If not found, try to find by business ID (old format)
      if (!business) {
        business = await database.query('groups')
          .where('business_id', setupIdentifier)
          .first();
      }

      if (!business) {
        await this.client.sendMessage(chat.id._serialized, '❌ Business not found. Please check your setup code.\n\nMake sure you\'re using the correct format: /setup businessname-CODE');
        return;
      }

      // Check if this group is already registered
      const existingGroup = await database.query('groups')
        .where('group_id', chat.id._serialized)
        .first();

      if (existingGroup) {
        await this.client.sendMessage(chat.id._serialized, '❌ This group is already registered.');
        return;
      }

      // Check if this business already has both groups
      const groupCount = await database.query('groups')
        .where('business_id', business.business_id)
        .count('* as count')
        .first();

      if (groupCount.count >= 2) {
        await this.client.sendMessage(chat.id._serialized, '❌ This business already has both groups registered.');
        return;
      }

      // Determine group type based on existing groups
      const existingGroups = await database.query('groups')
        .where('business_id', business.business_id)
        .select('group_type');

      let groupType;
      if (existingGroups.length === 0) {
        // First group - ask user which type
        await this.client.sendMessage(chat.id._serialized, 
          `🤖 *Business Setup*\n\nBusiness: ${business.business_name}\n\nIs this a sales group or delivery group?\n\nReply with "sales" or "delivery"`
        );
        return;
      } else {
        // Second group - automatically determine type
        const existingType = existingGroups[0].group_type;
        groupType = existingType === 'sales' ? 'delivery' : 'sales';
      }

      // Register the group
      const insertData = {
        user_id: business.user_id,
        business_id: business.business_id,
        business_name: business.business_name,
        group_name: chat.name,
        group_id: chat.id._serialized,
        group_type: groupType
      };

      // Add short code data if available
      if (business.short_code && business.setup_identifier) {
        insertData.short_code = business.short_code;
        insertData.setup_identifier = business.setup_identifier;
      }

      await database.query('groups').insert(insertData);

      // Send confirmation
      await this.client.sendMessage(chat.id._serialized, 
        `✅ *${groupType === 'sales' ? 'Sales' : 'Delivery'} Group Registered!*\n\n` +
        `*Business:* ${business.business_name}\n` +
        `*Group:* ${chat.name}\n` +
        `*Type:* ${groupType}\n\n` +
        (groupType === 'sales' ? 
          '🛍️ Customers can now place orders in this group.' :
          '🚚 Delivery staff can manage orders in this group.')
      );

      logger.info('Group registered successfully', {
        groupId: chat.id._serialized,
        groupName: chat.name,
        businessId: business.business_id,
        businessName: business.business_name,
        groupType
      });
    } catch (error) {
      logger.error('Error handling setup command:', error);
      await this.client.sendMessage(chat.id._serialized, '❌ Error during setup. Please try again.');
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
        await this.client.sendMessage(groupId, 
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
        await this.client.sendMessage(groupId,
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

*Sales Group:* For receiving orders from customers
*Delivery Group:* For managing and tracking deliveries

The bot will now:
• Process orders from the sales group
• Forward them to the delivery group
• Track order status
• Generate daily reports
• Send pending order reminders

For help, type /help in the delivery group.
      `;

      await this.client.sendMessage(setup.salesGroupId, welcomeMessage);
      await this.client.sendMessage(setup.deliveryGroupId, welcomeMessage);

      // Mark setup as complete
      setup.status = 'complete';
      
      logger.info('Group setup completed successfully', {
        businessName: setup.businessName,
        userId: setup.userId
      });
    } catch (error) {
      logger.error('Error completing setup:', error);
      setup.status = 'error';
      setup.error = error.message;
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
}

module.exports = WhatsAppService; 