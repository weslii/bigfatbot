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
        .select('groups.*', 'businesses.name as business_name')
        .join('businesses', 'groups.business_id', 'businesses.id')
        .where('groups.is_active', true);

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
        .select('groups.*', 'businesses.name as business_name')
        .join('businesses', 'groups.business_id', 'businesses.id')
        .where('groups.is_active', true);

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