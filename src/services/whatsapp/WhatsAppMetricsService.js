const database = require('../../config/database');
const logger = require('../../utils/logger');

class WhatsAppMetricsService {
  constructor() {
    this.messageHistory = [];
    this.cleanupInterval = null;
  }

  async loadMetrics() {
    try {
      let metrics = await database.query('bot_metrics').select('*').first();
      if (!metrics) {
        // Create initial metrics record
        const inserted = await database.query('bot_metrics').insert({
          total_messages: 0,
          successful_messages: 0,
          failed_messages: 0,
          response_times: JSON.stringify([]),
          daily_counts: JSON.stringify({}),
          last_activity: null
        }).returning('*');
        metrics = inserted[0];
      }
      // Parse JSON fields if they come as strings
      if (typeof metrics.response_times === 'string') {
        try {
          metrics.response_times = JSON.parse(metrics.response_times);
        } catch {
          metrics.response_times = [];
        }
      }
      if (typeof metrics.daily_counts === 'string') {
        try {
          metrics.daily_counts = JSON.parse(metrics.daily_counts);
        } catch {
          metrics.daily_counts = {};
        }
      }
      return metrics;
    } catch (error) {
      logger.error('Error loading bot metrics:', error);
      return null;
    }
  }

  async saveMetrics(metrics) {
    try {
      // logger.info('[saveMetrics] saving metrics:', metrics);
      // Ensure response_times is a valid array and serialize it properly
      let responseTimes = metrics.response_times;
      if (!Array.isArray(responseTimes)) {
        responseTimes = [];
      }
      // Ensure daily_counts is a valid object
      let dailyCounts = metrics.daily_counts;
      if (typeof dailyCounts !== 'object' || dailyCounts === null) {
        dailyCounts = {};
      }
      // Validate and clean the data before saving
      const cleanMetrics = {
        total_messages: parseInt(metrics.total_messages) || 0,
        successful_messages: parseInt(metrics.successful_messages) || 0,
        failed_messages: parseInt(metrics.failed_messages) || 0,
        response_times: JSON.stringify(responseTimes),
        daily_counts: JSON.stringify(dailyCounts),
        last_activity: metrics.last_activity || new Date(),
        updated_at: new Date(),
        parsing_attempts: parseInt(metrics.parsing_attempts) || 0,
        parsing_successes: parseInt(metrics.parsing_successes) || 0,
        parsing_failures: parseInt(metrics.parsing_failures) || 0,
        filtered_messages: parseInt(metrics.filtered_messages) || 0,
        ai_parsed_orders: parseInt(metrics.ai_parsed_orders) || 0,
        pattern_parsed_orders: parseInt(metrics.pattern_parsed_orders) || 0
      };
      // logger.info('[saveMetrics] cleanMetrics to update:', cleanMetrics);
      if (!metrics.id) {
        // logger.warn('[saveMetrics] No metrics.id found when saving metrics. Attempting fallback update.');
        // Fallback: update the first row if only one exists
        const allRows = await database.query('bot_metrics').select('id');
        // logger.info('[saveMetrics] allRows:', allRows);
        if (allRows.length === 1) {
          // logger.info('[saveMetrics] Updating row with id:', allRows[0].id);
          await database.query('bot_metrics').where('id', allRows[0].id).update(cleanMetrics);
        } else {
          // logger.error('[saveMetrics] Could not update bot_metrics: no id and multiple rows exist.');
        }
      } else {
        // logger.info('[saveMetrics] Updating row with id:', metrics.id);
        await database.query('bot_metrics').where('id', metrics.id).update(cleanMetrics);
      }
    } catch (error) {
      logger.error('Error saving bot metrics:', error);
    }
  }

  async updateMetrics({success, responseTime, attemptedParsing, filteredOut, parsedWith}) {
    try {
      const metrics = await this.loadMetrics();
      if (!metrics) return;

      // ---
      // DAILY MESSAGE COUNTING FOR ADMIN DASHBOARD:
      // Each time a message is processed, increment the count for today's date in metrics.daily_counts.
      // This is used to display the 'Daily Messages' metric in the admin dashboard.
      // ---

      const today = new Date().toISOString().slice(0, 10);
      const dailyCounts = metrics.daily_counts || {};
      dailyCounts[today] = (dailyCounts[today] || 0) + 1;

      let responseTimes = metrics.response_times;
      if (!Array.isArray(responseTimes)) {
        if (typeof responseTimes === 'string') {
          try { responseTimes = JSON.parse(responseTimes); } catch { responseTimes = []; }
        } else if (responseTimes && typeof responseTimes === 'object') {
          try { responseTimes = Object.values(responseTimes); } catch { responseTimes = []; }
        } else { responseTimes = []; }
      }
      if (!Array.isArray(responseTimes)) responseTimes = [];
      responseTimes.push(responseTime);
      if (responseTimes.length > 100) responseTimes.shift();

      // New metrics for parsing performance
      const parsing_attempts = (metrics.parsing_attempts || 0) + (attemptedParsing ? 1 : 0);
      const parsing_successes = (metrics.parsing_successes || 0) + (attemptedParsing && success ? 1 : 0);
      const parsing_failures = (metrics.parsing_failures || 0) + (attemptedParsing && !success ? 1 : 0);
      const filtered_messages = (metrics.filtered_messages || 0) + (filteredOut ? 1 : 0);
      // New: Track AI and pattern-matching parsed orders
      const ai_parsed_orders = (metrics.ai_parsed_orders || 0) + (parsedWith === 'AI' ? 1 : 0);
      const pattern_parsed_orders = (metrics.pattern_parsed_orders || 0) + (parsedWith === 'pattern-matching' ? 1 : 0);

      // Update per-day parsing metrics in parsing_metrics_by_day
      let parsingMetricsByDay = metrics.parsing_metrics_by_day;
      if (typeof parsingMetricsByDay === 'string') {
        try { parsingMetricsByDay = JSON.parse(parsingMetricsByDay); } catch { parsingMetricsByDay = {}; }
      }
      if (!parsingMetricsByDay || typeof parsingMetricsByDay !== 'object') parsingMetricsByDay = {};
      if (!parsingMetricsByDay[today]) parsingMetricsByDay[today] = { attempts: 0, successes: 0, failures: 0 };
      if (attemptedParsing) {
        parsingMetricsByDay[today].attempts += 1;
        if (success) parsingMetricsByDay[today].successes += 1;
        else parsingMetricsByDay[today].failures += 1;
      }

      const updatedMetrics = {
        ...metrics,
        total_messages: (metrics.total_messages || 0) + 1,
        successful_messages: (metrics.successful_messages || 0) + (success ? 1 : 0),
        failed_messages: (metrics.failed_messages || 0) + (success ? 0 : 1),
        response_times: responseTimes,
        daily_counts: dailyCounts,
        last_activity: new Date(),
        parsing_attempts,
        parsing_successes,
        parsing_failures,
        filtered_messages,
        ai_parsed_orders,
        pattern_parsed_orders,
        parsing_metrics_by_day: parsingMetricsByDay
      };
      await this.saveMetrics(updatedMetrics);
    } catch (error) {
      logger.error('Error updating metrics:', error);
    }
  }

  // This method provides bot statistics for the admin dashboard, including daily messages, response time, and parsing rates.
  async getBotMetrics() {
    try {
      const metrics = await this.loadMetrics();
      if (!metrics) {
        return {
          lastActivity: null,
          messageSuccessRate: 100,
          avgResponseTime: 0,
          dailyMessages: 0,
          parsingSuccessRate: 100,
          parsingAttempts: 0,
          filteredMessages: 0
        };
      }
      // Calculate parsing success rate based on parsing attempts
      const attempts = metrics.parsing_attempts || 0;
      const successes = metrics.parsing_successes || 0;
      const parsingSuccessRate = attempts > 0 ? (successes / attempts) * 100 : 100;
      // Average response time (ms)
      let responseTimes = metrics.response_times;
      if (!Array.isArray(responseTimes)) {
        if (typeof responseTimes === 'string') {
          try { responseTimes = JSON.parse(responseTimes); } catch { responseTimes = []; }
        } else if (responseTimes && typeof responseTimes === 'object') {
          try { responseTimes = Object.values(responseTimes); } catch { responseTimes = []; }
        } else { responseTimes = []; }
      }
      if (!Array.isArray(responseTimes)) responseTimes = [];
      const avgResponse = responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;
      // Daily messages (average over last 7 days)
      const dailyCounts = metrics.daily_counts || {};
      const days = Object.keys(dailyCounts).sort().slice(-7);
      const dailyAvg = days.length > 0 ? days.map(d => dailyCounts[d]).reduce((a, b) => a + b, 0) / days.length : 0;
      return {
        lastActivity: metrics.last_activity,
        messageSuccessRate: (metrics.total_messages ? (metrics.successful_messages / metrics.total_messages) * 100 : 100),
        avgResponseTime: avgResponse,
        dailyMessages: dailyAvg,
        parsingSuccessRate,
        parsingAttempts: attempts,
        filteredMessages: metrics.filtered_messages || 0
      };
    } catch (error) {
      logger.error('Error getting bot metrics:', error);
      return {
        lastActivity: null,
        messageSuccessRate: 100,
        avgResponseTime: 0,
        dailyMessages: 0,
        parsingSuccessRate: 100,
        parsingAttempts: 0,
        filteredMessages: 0
      };
    }
  }
}

module.exports = WhatsAppMetricsService; 