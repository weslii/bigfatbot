// src/services/MessageService.js
const moment = require('moment');
const logger = require('../utils/logger');

class MessageService {
  static formatOrderConfirmation(order) {
    try {
      let message = `✅ *Order Confirmed*\n\n`;
      message += `*Order ID:* ${order.order_id}\n`;
      message += `*Customer:* ${order.customer_name}\n`;
      message += `*Phone:* ${order.customer_phone}\n`;
      message += `*Address:* ${order.address}\n`;
      message += `*Items:* ${order.items}\n`;
      
      if (order.delivery_date) {
        message += `*Delivery Date:* ${moment(order.delivery_date).format('DD/MM/YYYY')}\n`;
      }
      
      if (order.notes) {
        message += `\n*Notes:* ${order.notes}`;
      }
      
      return message;
    } catch (error) {
      logger.error('Error formatting order confirmation:', error);
      return 'Error formatting order confirmation';
    }
  }

  static formatSalesConfirmation(order) {
    try {
      let message = `🛍️ *New Order Received*\n\n`;
      message += `*Order ID:* ${order.order_id}\n`;
      message += `*Customer:* ${order.customer_name}\n`;
      message += `*Phone:* ${order.customer_phone}\n`;
      message += `*Address:* ${order.address}\n`;
      message += `*Items:* ${order.items}\n`;
      
      if (order.delivery_date) {
        message += `*Delivery Date:* ${moment(order.delivery_date).format('DD/MM/YYYY')}\n`;
      }
      
      if (order.notes) {
        message += `\n*Notes:* ${order.notes}`;
      }
      
      return message;
    } catch (error) {
      logger.error('Error formatting sales confirmation:', error);
      return 'Error formatting sales confirmation';
    }
  }

  static formatPendingOrders(orders) {
    try {
      if (!orders || orders.length === 0) {
        return 'No pending orders at the moment.';
    }

      let message = `📋 *Pending Orders*\n\n`;
    
    orders.forEach((order, index) => {
        message += `*${index + 1}. Order ID:* ${order.order_id}\n`;
        message += `*Customer:* ${order.customer_name}\n`;
        message += `*Phone:* ${order.customer_phone}\n`;
        message += `*Address:* ${order.address}\n`;
        message += `*Items:* ${order.items}\n`;
        
        if (order.delivery_date) {
          message += `*Delivery Date:* ${moment(order.delivery_date).format('DD/MM/YYYY')}\n`;
        }
        
        if (order.notes) {
          message += `*Notes:* ${order.notes}\n`;
        }
        
        message += '\n';
      });

      return message;
    } catch (error) {
      logger.error('Error formatting pending orders:', error);
      return 'Error formatting pending orders';
    }
  }

  static formatDailyReport(report) {
    try {
      let message = `📊 *Daily Report*\n\n`;
      message += `*Total Orders:* ${report.total_orders}\n`;
      message += `*Delivered:* ${report.delivered_orders}\n`;
      message += `*Cancelled:* ${report.cancelled_orders}\n`;
      message += `*Scheduled Deliveries:* ${report.scheduled_deliveries}\n`;
      return message;
    } catch (error) {
      logger.error('Error formatting daily report:', error);
      return 'Error formatting daily report';
    }
  }

  static formatWeeklyReport(report) {
    try {
      let message = `📊 *Weekly Report*\n\n`;
      message += `*Total Orders:* ${report.total_orders}\n`;
      message += `*Delivered:* ${report.delivered_orders}\n`;
      message += `*Cancelled:* ${report.cancelled_orders}\n`;
      message += `*Scheduled Deliveries:* ${report.scheduled_deliveries}\n`;
      return message;
    } catch (error) {
      logger.error('Error formatting weekly report:', error);
      return 'Error formatting weekly report';
    }
  }

  static formatMonthlyReport(report) {
    try {
      let message = `📊 *Monthly Report*\n\n`;
      message += `*Total Orders:* ${report.total_orders}\n`;
      message += `*Delivered:* ${report.delivered_orders}\n`;
      message += `*Cancelled:* ${report.cancelled_orders}\n`;
      message += `*Scheduled Deliveries:* ${report.scheduled_deliveries}\n`;
      return message;
    } catch (error) {
      logger.error('Error formatting monthly report:', error);
      return 'Error formatting monthly report';
    }
  }

  static formatHelpMessage() {
    return `*Available Commands:*\n\n` +
           `*Order Management:*\n` +
           `• /orders - View pending orders\n` +
           `• /deliver <order_id> - Mark order as delivered\n` +
           `• /cancel <order_id> - Cancel an order\n\n` +
           `*Reports:*\n` +
           `• /daily - View today's report\n` +
           `• /weekly - View weekly report\n` +
           `• /monthly - View monthly report\n\n` +
           `*Help:*\n` +
           `• /help - Show this help message`;
  }
}

module.exports = MessageService;