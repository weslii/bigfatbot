const database = require('../../config/database');
const logger = require('../../utils/logger');
const OrderService = require('../OrderService');
const MessageService = require('../MessageService');
const NotificationService = require('../NotificationService');

class TelegramOrderHandler {
  constructor(coreService) {
    this.core = coreService;
  }

  async markOrderAsDelivered(orderId, deliveryPerson, groupInfo) {
    try {
      // Debug log for order lookup
      logger.info(`[markOrderAsDelivered] Looking up order`, { orderId, businessId: groupInfo.business_id });
      const order = await OrderService.getOrderById(orderId, groupInfo.business_id);
      if (!order) {
        await this.core.sendMessage(groupInfo.group_id, `❌ I couldn\'t find order #${orderId}😕. Please check the order ID and try again.`);
        return;
      }

      if (order.status === 'delivered') {
        await this.core.sendMessage(groupInfo.group_id, `ℹ️ Order #${orderId} is already marked as delivered.`);
        return;
      }

      if (order.status === 'cancelled') {
        await this.core.sendMessage(groupInfo.group_id, `❌ I can\'t mark order #${orderId} as delivered😕. It was cancelled.`);
        return;
      }

      await OrderService.updateOrderStatus(orderId, 'delivered', deliveryPerson, groupInfo.business_id);
      
      // Send delivery confirmation to the group where delivery was marked
      await this.core.sendMessage(groupInfo.group_id, `✅ Order #${orderId} marked as delivered by ${deliveryPerson}.`);
      
      logger.info('Order marked as delivered', { orderId, deliveryPerson, businessId: groupInfo.business_id });
    } catch (error) {
      logger.error('Error marking order as delivered:', error);
      await this.core.sendMessage(groupInfo.group_id, `❌ I ran into an issue updating order #${orderId}😕. Please try again.`);
    }
  }

  async cancelOrder(orderId, cancelledBy, cancelledByNumber, groupInfo) {
    try {
      // Debug log for order lookup
      logger.info(`[cancelOrder] Looking up order`, { orderId, businessId: groupInfo.business_id });
      const order = await OrderService.getOrderById(orderId, groupInfo.business_id);
      if (!order) {
        await this.core.sendMessage(groupInfo.group_id, `❌ I couldn\'t find order #${orderId}😕. Please check the order ID and try again.`);
        return;
      }

      if (order.status === 'cancelled') {
        await this.core.sendMessage(groupInfo.group_id, `ℹ️ Order #${orderId} is already cancelled.`);
        return;
      }

      if (order.status === 'delivered') {
        await this.core.sendMessage(groupInfo.group_id, `❌ I can\'t cancel delivered order #${orderId}😕. Once an order is delivered, it can\'t be cancelled.`);
        return;
      }

      await OrderService.updateOrderStatus(orderId, 'cancelled', cancelledBy, groupInfo.business_id);
      
      // Send cancellation notification to the group where cancellation was initiated
      const displayName = cancelledBy || cancelledByNumber;
      await this.core.sendMessage(groupInfo.group_id, `❌ Order #${orderId} cancelled by ${displayName}.`);
      
      // Get both sales and delivery groups for this business
      const businessGroups = await database.query('groups')
        .where('business_id', groupInfo.business_id)
        .whereIn('group_type', ['sales', 'delivery'])
        .select('group_id', 'group_type');
      
      // Send notification to the other group (not the one where cancellation was initiated)
      for (const group of businessGroups) {
        if (group.group_id !== groupInfo.group_id) {
          const groupType = group.group_type === 'sales' ? 'Sales' : 'Delivery';
          await this.core.sendMessage(group.group_id, 
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
      await this.core.sendMessage(groupInfo.group_id, `❌ I ran into an issue cancelling order #${orderId}😕. Please try again.`);
    }
  }

  async handleReplyCompletion(message, deliveryPerson, groupInfo) {
    try {
      const repliedMessage = message.reply_to_message;
      if (!repliedMessage) {
        await this.core.sendMessage(groupInfo.group_id, '❌ I need you to reply to an order message with "done" to mark it as delivered😕.');
        return;
      }

      const orderId = this.extractOrderIdFromMessage(repliedMessage.text);
      if (!orderId) {
        await this.core.sendMessage(groupInfo.group_id, '❌ I couldn\'t identify the order😕. Please use the command format: done #ORDER_ID');
        return;
      }

      await this.markOrderAsDelivered(orderId, deliveryPerson, groupInfo);
    } catch (error) {
      logger.error('Error handling reply completion:', error);
      await this.core.sendMessage(groupInfo.group_id, '❌ I ran into an issue processing the delivery😕. Please try again.');
    }
  }

  async handleReplyCancellation(message, cancelledBy, cancelledByNumber, groupInfo) {
    try {
      const repliedMessage = message.reply_to_message;
      if (!repliedMessage) {
        await this.core.sendMessage(groupInfo.group_id, '❌ I need you to reply to an order message with "cancel" to cancel it😕.');
        return;
      }

      const orderId = this.extractOrderIdFromMessage(repliedMessage.text);
      if (!orderId) {
        await this.core.sendMessage(groupInfo.group_id, '❌ I couldn\'t identify the order😕. Please use the command format: cancel #ORDER_ID');
        return;
      }

      await this.cancelOrder(orderId, cancelledBy, cancelledByNumber, groupInfo);
    } catch (error) {
      logger.error('Error handling reply cancellation:', error);
      await this.core.sendMessage(groupInfo.group_id, '❌ I ran into an issue cancelling the order😕. Please try again.');
    }
  }

  async sendHelpMessage(groupInfo) {
    try {
      const helpMessage = MessageService.formatHelpMessage();
      await this.core.sendMessage(groupInfo.group_id, helpMessage);
    } catch (error) {
      logger.error('Error sending help message:', error);
    }
  }

  async sendDailyReport(groupInfo) {
    try {
      const report = await OrderService.getDailyReport(groupInfo.business_id);
      const reportMessage = MessageService.formatDailyReport(report);
      await this.core.sendMessage(groupInfo.group_id, reportMessage);
    } catch (error) {
      logger.error('Error sending daily report:', error);
      await this.core.sendMessage(groupInfo.group_id, '❌ I ran into an issue generating the daily report😕. Please try again.');
    }
  }

  async sendPendingOrders(groupInfo) {
    try {
      const pendingOrders = await OrderService.getPendingOrders(groupInfo.business_id);
      const pendingMessage = MessageService.formatPendingOrders(pendingOrders);
      await this.core.sendMessage(groupInfo.group_id, pendingMessage);
    } catch (error) {
      logger.error('Error sending pending orders:', error);
      await this.core.sendMessage(groupInfo.group_id, '❌ I ran into an issue fetching pending orders😕. Please try again.');
    }
  }

  async sendWeeklyReport(groupInfo) {
    try {
      const report = await OrderService.getWeeklyReport(groupInfo.business_id);
      const reportMessage = MessageService.formatWeeklyReport(report);
      await this.core.sendMessage(groupInfo.group_id, reportMessage);
    } catch (error) {
      logger.error('Error sending weekly report:', error);
      await this.core.sendMessage(groupInfo.group_id, '❌ I ran into an issue generating the weekly report😕. Please try again.');
    }
  }

  async sendMonthlyReport(groupInfo) {
    try {
      const report = await OrderService.getMonthlyReport(groupInfo.business_id);
      const reportMessage = MessageService.formatMonthlyReport(report);
      await this.core.sendMessage(groupInfo.group_id, reportMessage);
    } catch (error) {
      logger.error('Error sending monthly report:', error);
      await this.core.sendMessage(groupInfo.group_id, '❌ I ran into an issue generating the monthly report😕. Please try again.');
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

module.exports = TelegramOrderHandler; 