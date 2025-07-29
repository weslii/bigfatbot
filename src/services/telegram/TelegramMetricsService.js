const database = require('../../config/database');
const logger = require('../../utils/logger');

class TelegramMetricsService {
  constructor() {
    this.metrics = {
      messageCount: 0,
      ordersCreated: 0,
      ordersDelivered: 0,
      ordersCancelled: 0,
      processingTime: 0,
      errors: 0,
      lastUpdate: Date.now()
    };
  }

  async loadMetrics() {
    try {
      // Load metrics from database
      const botMetrics = await database.query('bot_metrics')
        .where('platform', 'telegram')
        .first();

      if (botMetrics) {
        this.metrics = {
          ...this.metrics,
          ...botMetrics,
          lastUpdate: Date.now()
        };
      }

      logger.info('Telegram metrics loaded successfully');
    } catch (error) {
      logger.error('Error loading Telegram metrics:', error);
    }
  }

  async saveMetrics(metrics) {
    try {
      const metricsData = {
        platform: 'telegram',
        message_count: metrics.messageCount || 0,
        orders_created: metrics.ordersCreated || 0,
        orders_delivered: metrics.ordersDelivered || 0,
        orders_cancelled: metrics.ordersCancelled || 0,
        processing_time: metrics.processingTime || 0,
        errors: metrics.errors || 0,
        updated_at: new Date()
      };

      // Check if record exists
      const existing = await database.query('bot_metrics')
        .where('platform', 'telegram')
        .first();

      if (existing) {
        // Update existing record
        await database.query('bot_metrics')
          .where('platform', 'telegram')
          .update(metricsData);
      } else {
        // Create new record
        await database.query('bot_metrics').insert(metricsData);
      }

      logger.info('Telegram metrics saved successfully');
    } catch (error) {
      logger.error('Error saving Telegram metrics:', error);
    }
  }

  async updateMetrics(params) {
    try {
      const {
        messageCount = 0,
        ordersCreated = 0,
        ordersDelivered = 0,
        ordersCancelled = 0,
        processingTime = 0,
        success = 1,
        platform = 'telegram'
      } = params;

      // Update local metrics
      this.metrics.messageCount += messageCount;
      this.metrics.ordersCreated += ordersCreated;
      this.metrics.ordersDelivered += ordersDelivered;
      this.metrics.ordersCancelled += ordersCancelled;
      this.metrics.processingTime += processingTime;
      this.metrics.errors += (1 - success);
      this.metrics.lastUpdate = Date.now();

      // Save to database periodically (every 10 updates)
      if (this.metrics.messageCount % 10 === 0) {
        await this.saveMetrics(this.metrics);
      }

      logger.debug('Telegram metrics updated:', {
        messageCount,
        ordersCreated,
        processingTime,
        success
      });
    } catch (error) {
      logger.error('Error updating Telegram metrics:', error);
    }
  }

  async getBotMetrics() {
    try {
      // Get metrics from database
      const botMetrics = await database.query('bot_metrics')
        .where('platform', 'telegram')
        .first();

      if (!botMetrics) {
        return {
          platform: 'telegram',
          messageCount: 0,
          ordersCreated: 0,
          ordersDelivered: 0,
          ordersCancelled: 0,
          processingTime: 0,
          errors: 0,
          lastUpdate: new Date()
        };
      }

      return {
        platform: 'telegram',
        messageCount: botMetrics.message_count || 0,
        ordersCreated: botMetrics.orders_created || 0,
        ordersDelivered: botMetrics.orders_delivered || 0,
        ordersCancelled: botMetrics.orders_cancelled || 0,
        processingTime: botMetrics.processing_time || 0,
        errors: botMetrics.errors || 0,
        lastUpdate: botMetrics.updated_at || new Date()
      };
    } catch (error) {
      logger.error('Error getting Telegram bot metrics:', error);
      return {
        platform: 'telegram',
        messageCount: 0,
        ordersCreated: 0,
        ordersDelivered: 0,
        ordersCancelled: 0,
        processingTime: 0,
        errors: 0,
        lastUpdate: new Date()
      };
    }
  }

  async getDailyMetrics(date = new Date()) {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Get orders for the day
      const orders = await database.query('orders')
        .where('business_id', 'in', function() {
          this.select('business_id')
            .from('groups')
            .where('platform', 'telegram');
        })
        .whereBetween('created_at', [startOfDay, endOfDay]);

      const metrics = {
        date: startOfDay.toISOString().split('T')[0],
        totalOrders: orders.length,
        deliveredOrders: orders.filter(o => o.status === 'delivered').length,
        pendingOrders: orders.filter(o => o.status === 'pending').length,
        cancelledOrders: orders.filter(o => o.status === 'cancelled').length,
        totalRevenue: orders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0),
        platform: 'telegram'
      };

      return metrics;
    } catch (error) {
      logger.error('Error getting Telegram daily metrics:', error);
      return {
        date: date.toISOString().split('T')[0],
        totalOrders: 0,
        deliveredOrders: 0,
        pendingOrders: 0,
        cancelledOrders: 0,
        totalRevenue: 0,
        platform: 'telegram'
      };
    }
  }

  async getWeeklyMetrics(startDate = new Date()) {
    try {
      const startOfWeek = new Date(startDate);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      // Get orders for the week
      const orders = await database.query('orders')
        .where('business_id', 'in', function() {
          this.select('business_id')
            .from('groups')
            .where('platform', 'telegram');
        })
        .whereBetween('created_at', [startOfWeek, endOfWeek]);

      const dailyBreakdown = [];
      for (let i = 0; i < 7; i++) {
        const day = new Date(startOfWeek);
        day.setDate(day.getDate() + i);
        const dayOrders = orders.filter(o => {
          const orderDate = new Date(o.created_at);
          return orderDate.toDateString() === day.toDateString();
        });
        
        dailyBreakdown.push({
          date: day.toISOString().split('T')[0],
          orders: dayOrders.length
        });
      }

      const metrics = {
        startDate: startOfWeek.toISOString().split('T')[0],
        endDate: endOfWeek.toISOString().split('T')[0],
        totalOrders: orders.length,
        deliveredOrders: orders.filter(o => o.status === 'delivered').length,
        totalRevenue: orders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0),
        dailyBreakdown,
        platform: 'telegram'
      };

      return metrics;
    } catch (error) {
      logger.error('Error getting Telegram weekly metrics:', error);
      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: startDate.toISOString().split('T')[0],
        totalOrders: 0,
        deliveredOrders: 0,
        totalRevenue: 0,
        dailyBreakdown: [],
        platform: 'telegram'
      };
    }
  }

  async getMonthlyMetrics(month = new Date()) {
    try {
      const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
      const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999);

      // Get orders for the month
      const orders = await database.query('orders')
        .where('business_id', 'in', function() {
          this.select('business_id')
            .from('groups')
            .where('platform', 'telegram');
        })
        .whereBetween('created_at', [startOfMonth, endOfMonth]);

      const weeklyBreakdown = [];
      const weeksInMonth = Math.ceil((endOfMonth.getDate() + startOfMonth.getDay()) / 7);
      
      for (let week = 1; week <= weeksInMonth; week++) {
        const weekStart = new Date(startOfMonth);
        weekStart.setDate(weekStart.getDate() + (week - 1) * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        const weekOrders = orders.filter(o => {
          const orderDate = new Date(o.created_at);
          return orderDate >= weekStart && orderDate <= weekEnd;
        });
        
        weeklyBreakdown.push({
          week,
          orders: weekOrders.length
        });
      }

      const metrics = {
        month: startOfMonth.toISOString().slice(0, 7), // YYYY-MM format
        totalOrders: orders.length,
        deliveredOrders: orders.filter(o => o.status === 'delivered').length,
        totalRevenue: orders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0),
        weeklyBreakdown,
        platform: 'telegram'
      };

      return metrics;
    } catch (error) {
      logger.error('Error getting Telegram monthly metrics:', error);
      return {
        month: month.toISOString().slice(0, 7),
        totalOrders: 0,
        deliveredOrders: 0,
        totalRevenue: 0,
        weeklyBreakdown: [],
        platform: 'telegram'
      };
    }
  }
}

module.exports = TelegramMetricsService; 