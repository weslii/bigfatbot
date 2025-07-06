const cron = require('node-cron');
const logger = require('../utils/logger');
const config = require('../config/config');
const OrderService = require('./OrderService');
const MessageService = require('./MessageService');
const database = require('../config/database');

class SchedulerService {
  constructor(whatsappService) {
    this.whatsappService = whatsappService;
    this.jobs = [];
  }

  start() {
    // Schedule daily report
    this.jobs.push(
      cron.schedule(config.BOT.DAILY_REPORT_TIME, async () => {
        try {
          await this.sendDailyReport();
        } catch (error) {
          logger.error('Error sending daily reports:', error);
        }
      })
    );

    // Schedule pending orders reminder
    this.jobs.push(
      cron.schedule(config.BOT.PENDING_ORDERS_TIME, async () => {
        try {
          await this.sendPendingOrdersReport();
        } catch (error) {
          logger.error('Error sending pending orders reminders:', error);
        }
      })
    );

    logger.info('Scheduler started successfully');
  }

  async sendDailyReport() {
    try {
      // Get all active groups
      const groups = await database.query('groups')
        .select('*')
        .where('is_active', true);

      for (const group of groups) {
        // Get today's orders for this business
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const orders = await database.query('orders')
          .where('business_id', group.business_id)
          .where('created_at', '>=', today)
          .orderBy('created_at', 'desc');

        // Format and send report
        const report = this.formatDailyReport(orders, group.business_name);
        await this.whatsappService.sendMessage(group.group_id, report);
      }
    } catch (error) {
      logger.error('Error sending daily report:', error);
    }
  }

  async sendPendingOrdersReport() {
    try {
      // Get all active groups
      const groups = await database.query('groups')
        .select('*')
        .where('is_active', true);

      for (const group of groups) {
        // Get pending orders for this business
        const pendingOrders = await database.query('orders')
          .where('business_id', group.business_id)
          .where('status', 'pending')
          .orderBy('created_at', 'desc');

        // Format and send report
        const report = this.formatPendingOrdersReport(pendingOrders, group.business_name);
        await this.whatsappService.sendMessage(group.group_id, report);
      }
    } catch (error) {
      logger.error('Error sending pending orders report:', error);
    }
  }

  formatDailyReport(orders, businessName) {
    const today = new Date().toLocaleDateString();
    let report = `📊 *Daily Report - ${businessName}*\n`;
    report += `📅 Date: ${today}\n\n`;

    if (orders.length === 0) {
      report += 'No orders today.';
    } else {
      report += `📦 Total Orders: ${orders.length}\n\n`;
      
      const statusCounts = {};
      orders.forEach(order => {
        statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
      });

      Object.entries(statusCounts).forEach(([status, count]) => {
        const emoji = this.getStatusEmoji(status);
        report += `${emoji} ${status.charAt(0).toUpperCase() + status.slice(1)}: ${count}\n`;
      });

      report += '\n📋 Recent Orders:\n';
      orders.slice(0, 5).forEach(order => {
        const time = new Date(order.created_at).toLocaleTimeString();
        report += `• ${order.customer_name} - ${order.status} (${time})\n`;
      });
    }

    return report;
  }

  formatPendingOrdersReport(orders, businessName) {
    let report = `⏳ *Pending Orders Report - ${businessName}*\n\n`;

    if (orders.length === 0) {
      report += '✅ No pending orders at the moment.';
    } else {
      report += `📦 Total Pending Orders: ${orders.length}\n\n`;
      
      orders.forEach((order, index) => {
        const time = new Date(order.created_at).toLocaleString();
        report += `${index + 1}. *${order.customer_name}*\n`;
        report += `   📞 ${order.customer_phone}\n`;
        report += `   📍 ${order.delivery_address}\n`;
        report += `   🕐 ${time}\n\n`;
      });

      report += 'Please process these orders as soon as possible.';
    }

    return report;
  }

  getStatusEmoji(status) {
    const emojis = {
      'pending': '⏳',
      'confirmed': '✅',
      'preparing': '👨‍🍳',
      'out_for_delivery': '🚚',
      'delivered': '🎉',
      'cancelled': '❌'
    };
    return emojis[status] || '📦';
  }

  async sendReportsToAllBusinesses(reportType) {
    try {
      // Get all delivery groups
      const groups = await database.query('groups')
        .where('group_type', 'delivery');

      for (const group of groups) {
        try {
          let report;
          let message;

          switch (reportType) {
            case 'daily':
              report = await OrderService.getDailyReport(group.business_id);
              message = MessageService.formatDailyReport(report, new Date());
              break;
            case 'weekly':
              report = await OrderService.getWeeklyReport(group.business_id);
              message = MessageService.formatWeeklyReport(report);
              break;
            case 'monthly':
              report = await OrderService.getMonthlyReport(group.business_id);
              message = MessageService.formatMonthlyReport(report);
              break;
            default:
              logger.warn('Unknown report type:', reportType);
              continue;
          }

          await this.whatsappService.client.sendMessage(group.group_id, message);
          logger.info(`Sent ${reportType} report to business ${group.business_id}`);
        } catch (error) {
          logger.error(`Error sending ${reportType} report to business ${group.business_id}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error sending reports to all businesses:', error);
      throw error;
    }
  }

  async sendPendingOrdersToAllBusinesses() {
    try {
      // Get all delivery groups
      const groups = await database.query('groups')
        .where('group_type', 'delivery');

      for (const group of groups) {
        try {
          const orders = await OrderService.getPendingOrders(group.business_id);
          const message = MessageService.formatPendingOrders(orders);
          await this.whatsappService.client.sendMessage(group.group_id, message);
          logger.info(`Sent pending orders to business ${group.business_id}`);
        } catch (error) {
          logger.error(`Error sending pending orders to business ${group.business_id}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error sending pending orders to all businesses:', error);
      throw error;
    }
  }

  stop() {
    this.jobs.forEach(job => job.stop());
    logger.info('Scheduler stopped');
  }
}

module.exports = SchedulerService; 