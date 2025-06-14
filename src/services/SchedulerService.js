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
          await this.sendReportsToAllBusinesses('daily');
        } catch (error) {
          logger.error('Error sending daily reports:', error);
        }
      })
    );

    // Schedule pending orders reminder
    this.jobs.push(
      cron.schedule(config.BOT.PENDING_ORDERS_TIME, async () => {
        try {
          await this.sendPendingOrdersToAllBusinesses();
        } catch (error) {
          logger.error('Error sending pending orders reminders:', error);
        }
      })
    );

    logger.info('Scheduler started successfully');
  }

  async sendReportsToAllBusinesses(reportType) {
    try {
      // Get all delivery groups
      const groups = await database.query.query(
        'SELECT * FROM groups WHERE group_type = $1',
        ['delivery']
      );

      for (const group of groups.rows) {
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
      const groups = await database.query.query(
        'SELECT * FROM groups WHERE group_type = $1',
        ['delivery']
      );

      for (const group of groups.rows) {
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