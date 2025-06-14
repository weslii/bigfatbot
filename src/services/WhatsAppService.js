const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { v4: uuidv4 } = require('uuid');
const database = require('../config/database');
const logger = require('../utils/logger');
const RegistrationService = require('./RegistrationService');
const OrderService = require('./OrderService');
const MessageService = require('./MessageService');
const OrderParser = require('./OrderParser');

class WhatsAppService {
  constructor() {
    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        args: ['--no-sandbox']
      }
    });

    this.client.on('qr', (qr) => {
      qrcode.generate(qr, { small: true });
      logger.info('QR Code generated');
    });

    this.client.on('ready', () => {
      logger.info('WhatsApp client is ready');
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

  async handleMessage(message) {
    try {
      const chat = await message.getChat();
      const contact = await message.getContact();
      
      // Handle setup command
      if (message.body.startsWith('/setup')) {
        await this.handleSetupCommand(message, chat, contact);
        return;
      }

      // Get group info from database
      const group = await database.query(
        'SELECT * FROM groups WHERE group_id = $1',
        [chat.id._serialized]
      );

      if (!group.rows[0]) {
        logger.warn('Message received from unknown group:', chat.id._serialized);
        return;
      }

      const groupInfo = group.rows[0];
      
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
        
        const order = await OrderService.createOrder(orderData);
        const deliveryConfirmation = MessageService.formatOrderConfirmation(order);
        const salesConfirmation = MessageService.formatSalesConfirmation(order);
        
        // Get delivery group for this business
        const deliveryGroup = await database.query(
          'SELECT * FROM groups WHERE business_id = $1 AND group_type = $2',
          [groupInfo.business_id, 'delivery']
        );

        if (deliveryGroup.rows[0]) {
          // Send detailed confirmation to delivery group
          await this.client.sendMessage(deliveryGroup.rows[0].group_id, deliveryConfirmation);
        }
        
        // Send simplified confirmation to sales group
        await this.client.sendMessage(groupInfo.group_id, salesConfirmation);
        
        logger.info('Order processed and confirmations sent', { 
          orderId: order.order_id,
          businessId: groupInfo.business_id 
        });
      }
    } catch (error) {
      logger.error('Error handling sales group message:', error);
      // Send error message to sales group if order parsing failed
      if (message.body.length > 20) { // Only if it looks like an order attempt
        await this.client.sendMessage(groupInfo.group_id, '❌ Could not process order. Please check the format and try again.');
      }
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

      // Parse business ID from command
      const parts = message.body.split(' ');
      if (parts.length !== 2) {
        await this.client.sendMessage(chat.id._serialized, '❌ Invalid setup command. Use: /setup <business_id>');
        return;
      }

      const businessId = parts[1];

      // Check if business exists
      const business = await database.query(
        'SELECT * FROM groups WHERE business_id = $1',
        [businessId]
      );

      if (!business.rows[0]) {
        await this.client.sendMessage(chat.id._serialized, '❌ Invalid business ID.');
        return;
      }

      // Check if this group is already registered
      const existingGroup = await database.query(
        'SELECT * FROM groups WHERE group_id = $1',
        [chat.id._serialized]
      );

      if (existingGroup.rows[0]) {
        await this.client.sendMessage(chat.id._serialized, '❌ This group is already registered.');
        return;
      }

      // Check if this business already has both groups
      const groupCount = await database.query(
        'SELECT COUNT(*) FROM groups WHERE business_id = $1',
        [businessId]
      );

      if (groupCount.rows[0].count >= 2) {
        await this.client.sendMessage(chat.id._serialized, '❌ This business already has both groups registered.');
        return;
      }

      // Determine group type based on existing groups
      const existingGroups = await database.query(
        'SELECT group_type FROM groups WHERE business_id = $1',
        [businessId]
      );

      let groupType;
      if (existingGroups.rows.length === 0) {
        // First group - ask user which type
        await this.client.sendMessage(chat.id._serialized, 
          'Is this a sales group or delivery group?\n' +
          'Reply with "sales" or "delivery"'
        );
        return;
      } else {
        // Second group - automatically determine type
        const existingType = existingGroups.rows[0].group_type;
        groupType = existingType === 'sales' ? 'delivery' : 'sales';
      }

      // Register the group
      await database.query(
        `INSERT INTO groups (
          user_id, business_id, business_name, group_name, 
          group_id, group_type
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          business.rows[0].user_id,
          businessId,
          business.rows[0].business_name,
          chat.name,
          chat.id._serialized,
          groupType
        ]
      );

      // Send confirmation
      await this.client.sendMessage(chat.id._serialized, 
        `✅ ${groupType === 'sales' ? 'Sales' : 'Delivery'} group registered successfully!\n\n` +
        `Group Name: ${chat.name}\n` +
        `Business: ${business.rows[0].business_name}\n\n` +
        (groupType === 'sales' ? 
          'Customers can now place orders in this group.' :
          'Delivery staff can manage orders in this group.')
      );

      logger.info('Group registered successfully', {
        groupId: chat.id._serialized,
        groupName: chat.name,
        businessId,
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