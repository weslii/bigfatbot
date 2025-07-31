const database = require('../../config/database');
const logger = require('../../utils/logger');

class TelegramMetricsService {
  constructor() {
    this.metrics = {
      totalMessages: 0,
      successfulParses: 0,
      failedParses: 0,
      averageResponseTime: 0,
      totalResponseTime: 0,
      lastUpdated: new Date()
    };
    this.loadMetrics();
  }

  async loadMetrics() {
    try {
      const result = await database.query('bot_metrics')
        .where('platform', 'telegram')
        .first();

      if (result) {
        // Safely handle response_times - it might be null, undefined, or a JSON string
        let responseTimes = [];
        if (result.response_times) {
          if (typeof result.response_times === 'string') {
            try {
              responseTimes = JSON.parse(result.response_times);
            } catch (e) {
              logger.warn('Failed to parse response_times JSON:', e);
              responseTimes = [];
            }
          } else if (Array.isArray(result.response_times)) {
            responseTimes = result.response_times;
          }
        }

        // Safely handle daily_counts - it might be null, undefined, or a JSON string
        let dailyCounts = {};
        if (result.daily_counts) {
          if (typeof result.daily_counts === 'string') {
            try {
              dailyCounts = JSON.parse(result.daily_counts);
            } catch (e) {
              logger.warn('Failed to parse daily_counts JSON:', e);
              dailyCounts = {};
            }
          } else if (typeof result.daily_counts === 'object' && result.daily_counts !== null) {
            dailyCounts = result.daily_counts;
          }
        }

        // Calculate average response time safely
        const avgResponseTime = responseTimes.length > 0 
          ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
          : 0;
        const totalResponseTime = responseTimes.reduce((a, b) => a + b, 0);

        this.metrics = {
          totalMessages: result.total_messages || 0,
          successfulParses: result.successful_messages || 0,
          failedParses: result.failed_messages || 0,
          averageResponseTime: avgResponseTime,
          totalResponseTime: totalResponseTime,
          dailyCounts: dailyCounts,
          lastUpdated: result.updated_at || new Date()
        };
        logger.info('Telegram metrics loaded from database');
      } else {
        // Create initial record for Telegram
        await database.query('bot_metrics').insert({
          platform: 'telegram',
          total_messages: 0,
          successful_messages: 0,
          failed_messages: 0,
          response_times: JSON.stringify([]),
          daily_counts: JSON.stringify({}),
          parsing_attempts: 0,
          parsing_successes: 0,
          parsing_failures: 0,
          filtered_messages: 0,
          ai_parsed_orders: 0,
          pattern_parsed_orders: 0,
          parsing_metrics_by_day: JSON.stringify({}),
          created_at: new Date(),
          updated_at: new Date()
        });
        logger.info('Created initial Telegram metrics record');
      }
    } catch (error) {
      logger.error('Error loading Telegram metrics:', error);
    }
  }

  async saveMetrics() {
    try {
      // Ensure response_times is a valid array and serialize it properly
      let responseTimes = this.metrics.responseTimes || [];
      if (!Array.isArray(responseTimes)) {
        responseTimes = [];
      }

      // Ensure daily_counts is a valid object
      let dailyCounts = this.metrics.dailyCounts || {};
      if (typeof dailyCounts !== 'object' || dailyCounts === null) {
        dailyCounts = {};
      }

      await database.query('bot_metrics')
        .where('platform', 'telegram')
        .update({
          total_messages: this.metrics.totalMessages,
          successful_messages: this.metrics.successfulParses,
          failed_messages: this.metrics.failedParses,
          response_times: JSON.stringify(responseTimes),
          daily_counts: JSON.stringify(dailyCounts),
          updated_at: new Date()
        });
      
      logger.info('Telegram metrics saved to database');
    } catch (error) {
      logger.error('Error saving Telegram metrics:', error);
    }
  }

  async updateMetrics(params) {
    try {
      const {
        success,
        responseTime,
        attemptedParsing = false,
        filteredOut = false,
        parsedWith = null
      } = params;

      // Update message count
      this.metrics.totalMessages++;

      // Update parsing statistics
      if (attemptedParsing) {
        if (success) {
          this.metrics.successfulParses++;
        } else {
          this.metrics.failedParses++;
        }
      }

      // Update response time statistics
      if (responseTime) {
        // Initialize responseTimes array if it doesn't exist
        if (!this.metrics.responseTimes) {
          this.metrics.responseTimes = [];
        }
        
        // Add new response time to the array
        this.metrics.responseTimes.push(responseTime);
        
        // Keep only the last 100 response times to prevent memory issues
        if (this.metrics.responseTimes.length > 100) {
          this.metrics.responseTimes = this.metrics.responseTimes.slice(-100);
        }
        
        // Calculate average response time
        this.metrics.averageResponseTime = this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length;
        this.metrics.totalResponseTime = this.metrics.responseTimes.reduce((a, b) => a + b, 0);
      }

      // Update daily counts
      const today = new Date().toISOString().slice(0, 10);
      if (!this.metrics.dailyCounts) {
        this.metrics.dailyCounts = {};
      }
      this.metrics.dailyCounts[today] = (this.metrics.dailyCounts[today] || 0) + 1;

      // Save to database periodically (every 10 updates)
      if (this.metrics.totalMessages % 10 === 0) {
        await this.saveMetrics();
      }

      this.metrics.lastUpdated = new Date();
    } catch (error) {
      logger.error('Error updating Telegram metrics:', error);
    }
  }

  async getBotMetrics() {
    try {
      // Get overall metrics for Telegram
      const overall = await database.query('bot_metrics')
        .where('platform', 'telegram')
        .first();

      if (!overall) {
        return {
          overall: { total_messages: 0, successful_parses: 0, failed_parses: 0, average_response_time: 0 },
          today: { total_messages: 0, successful_parses: 0, failed_parses: 0, average_response_time: 0 },
          parsingMethods: []
        };
      }

      // Safely handle response_times - it might be null, undefined, or a JSON string
      let responseTimes = [];
      if (overall.response_times) {
        if (typeof overall.response_times === 'string') {
          try {
            responseTimes = JSON.parse(overall.response_times);
          } catch (e) {
            logger.warn('Failed to parse response_times JSON in getBotMetrics:', e);
            responseTimes = [];
          }
        } else if (Array.isArray(overall.response_times)) {
          responseTimes = overall.response_times;
        }
      }

      // Calculate average response time safely
      const avgResponseTime = responseTimes.length > 0 
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
        : 0;

      return {
        overall: {
          total_messages: overall.total_messages || 0,
          successful_parses: overall.successful_messages || 0,
          failed_parses: overall.failed_messages || 0,
          average_response_time: avgResponseTime
        },
        today: {
          total_messages: overall.total_messages || 0,
          successful_parses: overall.successful_messages || 0,
          failed_parses: overall.failed_messages || 0,
          average_response_time: avgResponseTime
        },
        parsingMethods: []
      };
    } catch (error) {
      logger.error('Error getting Telegram bot metrics:', error);
      return {
        overall: { total_messages: 0, successful_parses: 0, failed_parses: 0, average_response_time: 0 },
        today: { total_messages: 0, successful_parses: 0, failed_parses: 0, average_response_time: 0 },
        parsingMethods: []
      };
    }
  }

  async getConnectionStatus() {
    try {
      const status = await database.query('bot_connection_status')
        .where('id', 2) // Telegram uses ID 2
        .first();

      return status ? {
        status: status.status,
        botUsername: status.phone_number, // Reuse phone_number field for bot username
        lastUpdated: status.updated_at
      } : {
        status: 'unknown',
        botUsername: null,
        lastUpdated: null
      };
    } catch (error) {
      logger.error('Error getting Telegram connection status:', error);
      return {
        status: 'error',
        botUsername: null,
        lastUpdated: null
      };
    }
  }

  // Memory optimization method
  async cleanupOldMetrics() {
    try {
      // Keep only last 30 days of metrics
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      await database.query('bot_metrics')
        .where('platform', 'telegram')
        .where('created_at', '<', thirtyDaysAgo)
        .del();

      logger.info('Cleaned up old Telegram metrics');
    } catch (error) {
      logger.error('Error cleaning up old Telegram metrics:', error);
    }
  }
}

module.exports = TelegramMetricsService; 