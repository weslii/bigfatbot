const database = require('../../config/database');
const logger = require('../../utils/logger');
const OrderService = require('../OrderService');
const MessageService = require('../MessageService');

class WhatsAppOrderHandler {
  constructor(coreService) {
    this.core = coreService;
  }

  async handleReplyCompletion(message, senderName, groupInfo) {
    try {
      const quotedMessage = await message.getQuotedMessage();
      
      // Extract order ID using fallback method if the main method fails
      let orderId = null;
      try {
        if (typeof this.extractOrderIdFromMessage === 'function') {
          orderId = this.extractOrderIdFromMessage(quotedMessage.body);
        } else {
          // Fallback extraction method
          orderId = this.fallbackExtractOrderId(quotedMessage.body);
        }
      } catch (extractError) {
        logger.error('Error extracting order ID:', extractError);
        orderId = this.fallbackExtractOrderId(quotedMessage.body);
      }
      
      if (orderId) {
        await this.markOrderAsDelivered(orderId, senderName, groupInfo);
      } else {
        await this.core.client.sendMessage(groupInfo.group_id, '❌ Could not find order ID in the quoted message. Please try using: done #<order_id>');
      }
    } catch (error) {
      logger.error('Error handling reply completion:', error);
      await this.core.client.sendMessage(groupInfo.group_id, '❌ Error processing reply. Please try using: done #<order_id>');
    }
  }

  async handleReplyCancellation(message, senderName, senderNumber, groupInfo) {
    try {
      const quotedMessage = await message.getQuotedMessage();
      
      // Extract order ID using fallback method if the main method fails
      let orderId = null;
      try {
        if (typeof this.extractOrderIdFromMessage === 'function') {
          orderId = this.extractOrderIdFromMessage(quotedMessage.body);
        } else {
          // Fallback extraction method
          orderId = this.fallbackExtractOrderId(quotedMessage.body);
        }
      } catch (extractError) {
        logger.error('Error extracting order ID:', extractError);
        orderId = this.fallbackExtractOrderId(quotedMessage.body);
      }
      
      if (orderId) {
        await this.cancelOrder(orderId, senderName, senderNumber, groupInfo);
      } else {
        await this.core.client.sendMessage(groupInfo.group_id, '❌ Could not find order ID in the quoted message. Please try using: done #<order_id>');
      }
    } catch (error) {
      logger.error('Error handling reply cancellation:', error);
      await this.core.client.sendMessage(groupInfo.group_id, '❌ Error processing reply. Please try using: done #<order_id>');
    }
  }

  async markOrderAsDelivered(orderId, deliveryPerson, groupInfo) {
    try {
      // Debug log for order lookup
      logger.info(`[markOrderAsDelivered] Looking up order`, { orderId, businessId: groupInfo.business_id });
      const order = await OrderService.getOrderById(orderId, groupInfo.business_id);
      if (!order) {
        await this.core.client.sendMessage(groupInfo.group_id, `❌ Order #${orderId} not found.`);
        return;
      }

      if (order.status === 'delivered') {
        await this.core.client.sendMessage(groupInfo.group_id, `ℹ️ Order #${orderId} is already marked as delivered.`);
        return;
      }

      if (order.status === 'cancelled') {
        await this.core.client.sendMessage(groupInfo.group_id, `❌ Cannot mark cancelled order #${orderId} as delivered.`);
        return;
      }

      await OrderService.updateOrderStatus(orderId, 'delivered', deliveryPerson, groupInfo.business_id);
      
      // Send delivery confirmation to the group where delivery was marked
      await this.core.client.sendMessage(groupInfo.group_id, `✅ Order #${orderId} marked as delivered by ${deliveryPerson}.`);
      
      logger.info('Order marked as delivered', { orderId, deliveryPerson, businessId: groupInfo.business_id });
    } catch (error) {
      logger.error('Error marking order as delivered:', error);
      await this.core.client.sendMessage(groupInfo.group_id, `❌ Error updating order #${orderId}. Please try again.`);
    }
  }

  async cancelOrder(orderId, cancelledBy, cancelledByNumber, groupInfo) {
    try {
      // Debug log for order lookup
      logger.info(`[cancelOrder] Looking up order`, { orderId, businessId: groupInfo.business_id });
      const order = await OrderService.getOrderById(orderId, groupInfo.business_id);
      if (!order) {
        await this.core.client.sendMessage(groupInfo.group_id, `❌ Order #${orderId} not found.`);
        return;
      }

      if (order.status === 'cancelled') {
        await this.core.client.sendMessage(groupInfo.group_id, `ℹ️ Order #${orderId} is already cancelled.`);
        return;
      }

      if (order.status === 'delivered') {
        await this.core.client.sendMessage(groupInfo.group_id, `❌ Cannot cancel delivered order #${orderId}.`);
        return;
      }

      await OrderService.updateOrderStatus(orderId, 'cancelled', cancelledBy, groupInfo.business_id);
      
      // Send cancellation notification to the group where cancellation was initiated
      const displayName = cancelledBy || cancelledByNumber;
      await this.core.client.sendMessage(groupInfo.group_id, `❌ Order #${orderId} cancelled by ${displayName}.`);
      
      // Get both sales and delivery groups for this business
      const businessGroups = await database.query('groups')
        .where('business_id', groupInfo.business_id)
        .whereIn('group_type', ['sales', 'delivery'])
        .select('group_id', 'group_type');
      
      // Send notification to the other group (not the one where cancellation was initiated)
      for (const group of businessGroups) {
        if (group.group_id !== groupInfo.group_id) {
          const groupType = group.group_type === 'sales' ? 'Sales' : 'Delivery';
          await this.core.client.sendMessage(group.group_id, 
            `❌ *Order Cancelled*\n\n` +
            `*Order ID:* ${orderId}\n` +
            `*Customer:* ${order.customer_name}\n` +
            `*Cancelled by:* ${displayName} (${groupType} Team)\n` +
            `*Items:* ${order.items}`
          );
        }
      }
      
      logger.info('Order cancelled', { orderId, cancelledBy, businessId: groupInfo.business_id });
    } catch (error) {
      logger.error('Error cancelling order:', error);
      await this.core.client.sendMessage(groupInfo.group_id, `❌ Error cancelling order #${orderId}. Please try again.`);
    }
  }

  async sendHelpMessage(groupInfo) {
    try {
      const message = MessageService.formatHelpMessage();
      await this.core.client.sendMessage(groupInfo.group_id, message);
    } catch (error) {
      logger.error('Error sending help message:', error);
    }
  }

  async sendDailyReport(groupInfo) {
    try {
      const report = await OrderService.getDailyReport(groupInfo.business_id);
      const message = MessageService.formatDailyReport(report, new Date());
      await this.core.client.sendMessage(groupInfo.group_id, message);
    } catch (error) {
      logger.error('Error sending daily report:', error);
      await this.core.client.sendMessage(groupInfo.group_id, '❌ Error generating daily report.');
    }
  }

  async sendPendingOrders(groupInfo) {
    try {
      const orders = await OrderService.getPendingOrders(groupInfo.business_id);
      const message = MessageService.formatPendingOrders(orders);
      await this.core.client.sendMessage(groupInfo.group_id, message);
    } catch (error) {
      logger.error('Error sending pending orders:', error);
      await this.core.client.sendMessage(groupInfo.group_id, '❌ Error retrieving pending orders.');
    }
  }

  async sendWeeklyReport(groupInfo) {
    try {
      const report = await OrderService.getWeeklyReport(groupInfo.business_id);
      const message = MessageService.formatWeeklyReport(report);
      await this.core.client.sendMessage(groupInfo.group_id, message);
    } catch (error) {
      logger.error('Error sending weekly report:', error);
      await this.core.client.sendMessage(groupInfo.group_id, '❌ Error generating weekly report.');
    }
  }

  async sendMonthlyReport(groupInfo) {
    try {
      const report = await OrderService.getMonthlyReport(groupInfo.business_id);
      const message = MessageService.formatMonthlyReport(report);
      await this.core.client.sendMessage(groupInfo.group_id, message);
    } catch (error) {
      logger.error('Error sending monthly report:', error);
      await this.core.client.sendMessage(groupInfo.group_id, '❌ Error generating monthly report.');
    }
  }

  extractOrderIdFromMessage(messageText) {
    try {
      // Look for new order ID pattern: XXX-YYYYMMDD-XXX (where XXX is alphanumeric)
      const orderIdMatch = messageText.match(/([A-Z0-9]{3}-\d{8}-\d{3})/);
      if (orderIdMatch) {
        return orderIdMatch[1];
      }
      // Fallback: old pattern (just in case)
      const oldOrderIdMatch = messageText.match(/(\d{8}-\d{3})/);
      if (oldOrderIdMatch) {
        return oldOrderIdMatch[1];
      }
      // Also look for "Order ID:" pattern
      const orderIdPattern = messageText.match(/Order ID:\s*([^\n]+)/);
      if (orderIdPattern) {
        return orderIdPattern[1].trim();
      }
      return null;
    } catch (error) {
      logger.error('Error extracting order ID from message:', error);
      return null;
    }
  }

  fallbackExtractOrderId(messageText) {
    try {
      // Look for new order ID pattern: XXX-YYYYMMDD-XXX (where XXX is alphanumeric)
      const orderIdMatch = messageText.match(/([A-Z0-9]{3}-\d{8}-\d{3})/);
      if (orderIdMatch) {
        return orderIdMatch[1];
      }
      // Fallback: old pattern (just in case)
      const oldOrderIdMatch = messageText.match(/(\d{8}-\d{3})/);
      if (oldOrderIdMatch) {
        return oldOrderIdMatch[1];
      }
      // Also look for "Order ID:" pattern
      const orderIdPattern = messageText.match(/Order ID:\s*([^\n]+)/);
      if (orderIdPattern) {
        return orderIdPattern[1].trim();
      }
      return null;
    } catch (error) {
      logger.error('Error in fallback order ID extraction:', error);
      return null;
    }
  }
}

module.exports = WhatsAppOrderHandler; 