const database = require('../config/database');
const logger = require('../utils/logger');

class AnalyticsService {
  async getUserAnalytics(userId, timeRange = 30) {
    try {
      const userIdString = String(userId);
      
      // Get all business IDs for the user
      const userBusinesses = await database.query('groups')
        .select('business_id')
        .where('user_id', userIdString)
        .groupBy('business_id');

      const businessIds = userBusinesses.map(b => b.business_id);

      if (businessIds.length === 0) {
        return this.getEmptyAnalyticsData();
      }

      // Calculate date ranges
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - timeRange);
      
      const previousStartDate = new Date(startDate);
      previousStartDate.setDate(previousStartDate.getDate() - timeRange);

      // Get analytics data
      const [
        currentPeriodData,
        previousPeriodData,
        revenueTrend,
        orderTrend,
        businessRevenue,
        businessOrders,
        orderStatus,
        monthlyComparison,
        customerData
      ] = await Promise.all([
        this.getPeriodData(businessIds, startDate, endDate),
        this.getPeriodData(businessIds, previousStartDate, startDate),
        this.getRevenueTrend(businessIds, startDate, endDate),
        this.getOrderTrend(businessIds, startDate, endDate),
        this.getBusinessRevenue(businessIds, startDate, endDate),
        this.getBusinessOrders(businessIds, startDate, endDate),
        this.getOrderStatus(businessIds, startDate, endDate),
        this.getMonthlyComparison(businessIds),
        this.getCustomerData(businessIds, startDate, endDate)
      ]);

      // Calculate metrics
      const analyticsData = {
        // Overview metrics
        overview: {
          totalRevenue: currentPeriodData.totalRevenue,
          totalOrders: currentPeriodData.totalOrders,
          averageOrderValue: currentPeriodData.totalOrders > 0 ? currentPeriodData.totalRevenue / currentPeriodData.totalOrders : 0,
          activeCustomers: customerData.activeCustomers,
          revenueChange: this.calculateChange(currentPeriodData.totalRevenue, previousPeriodData.totalRevenue),
          orderChange: this.calculateChange(currentPeriodData.totalOrders, previousPeriodData.totalOrders),
          aovChange: this.calculateChange(
            currentPeriodData.totalOrders > 0 ? currentPeriodData.totalRevenue / currentPeriodData.totalOrders : 0,
            previousPeriodData.totalOrders > 0 ? previousPeriodData.totalRevenue / previousPeriodData.totalOrders : 0
          ),
          customerChange: this.calculateChange(customerData.activeCustomers, customerData.previousActiveCustomers)
        },

        // Chart data
        revenueTrend,
        orderTrend,
        businessRevenue,
        businessOrders,
        orderStatus,
        monthlyComparison,
        customerData,

        // Additional metrics
        highestDailyRevenue: revenueTrend.data.length > 0 ? Math.max(...revenueTrend.data) : 0,
        lowestDailyRevenue: revenueTrend.data.length > 0 ? Math.min(...revenueTrend.data) : 0,
        revenueGrowthRate: this.calculateChange(currentPeriodData.totalRevenue, previousPeriodData.totalRevenue),
        bestPerformingDay: this.getBestPerformingDay(revenueTrend),
        completionRate: this.calculateCompletionRate(orderStatus),
        avgProcessingTime: this.calculateAvgProcessingTime(currentPeriodData.totalOrders),
        peakOrderDay: this.getPeakOrderDay(orderTrend),
        orderGrowthRate: this.calculateChange(currentPeriodData.totalOrders, previousPeriodData.totalOrders)
      };

      return analyticsData;
    } catch (error) {
      logger.error('Error getting user analytics:', error);
      return this.getEmptyAnalyticsData();
    }
  }

  async getPeriodData(businessIds, startDate, endDate) {
    try {
      const result = await database.query('orders')
        .select(
          database.query.raw('SUM(total_revenue) as total_revenue'),
          database.query.raw('COUNT(*) as total_orders')
        )
        .whereIn('business_id', businessIds)
        .where('created_at', '>=', startDate)
        .where('created_at', '<=', endDate)
        .first();

      return {
        totalRevenue: parseFloat(result.total_revenue) || 0,
        totalOrders: parseInt(result.total_orders) || 0
      };
    } catch (error) {
      logger.error('Error getting period data:', error);
      return { totalRevenue: 0, totalOrders: 0 };
    }
  }

  async getRevenueTrend(businessIds, startDate, endDate) {
    try {
      const results = await database.query('orders')
        .select(
          database.query.raw('DATE(created_at) as date'),
          database.query.raw('SUM(total_revenue) as daily_revenue')
        )
        .whereIn('business_id', businessIds)
        .where('created_at', '>=', startDate)
        .where('created_at', '<=', endDate)
        .groupBy('date')
        .orderBy('date');

      const labels = [];
      const data = [];

      // Fill in missing dates with 0
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        // Find result by comparing date strings, handling both formats
        const result = results.find(r => {
          let resultDate;
          if (typeof r.date === 'string') {
            resultDate = r.date.split('T')[0]; // Handle '2025-07-04T23:00:00.000Z'
          } else if (r.date instanceof Date) {
            resultDate = r.date.toISOString().split('T')[0]; // Handle Date object
          } else {
            resultDate = String(r.date).split('T')[0]; // Fallback
          }
          return resultDate === dateStr;
        });
        
        labels.push(this.formatDate(currentDate));
        data.push(result ? parseFloat(result.daily_revenue) : 0);
        
        currentDate.setDate(currentDate.getDate() + 1);
      }

      return { labels, data };
    } catch (error) {
      logger.error('Error getting revenue trend:', error);
      return { labels: [], data: [] };
    }
  }

  async getOrderTrend(businessIds, startDate, endDate) {
    try {
      const results = await database.query('orders')
        .select(
          database.query.raw('DATE(created_at) as date'),
          database.query.raw('COUNT(*) as daily_orders')
        )
        .whereIn('business_id', businessIds)
        .where('created_at', '>=', startDate)
        .where('created_at', '<=', endDate)
        .groupBy('date')
        .orderBy('date');

      const labels = [];
      const data = [];

      // Fill in missing dates with 0
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        // Find result by comparing date strings, handling both formats
        const result = results.find(r => {
          let resultDate;
          if (typeof r.date === 'string') {
            resultDate = r.date.split('T')[0]; // Handle '2025-07-04T23:00:00.000Z'
          } else if (r.date instanceof Date) {
            resultDate = r.date.toISOString().split('T')[0]; // Handle Date object
          } else {
            resultDate = String(r.date).split('T')[0]; // Fallback
          }
          return resultDate === dateStr;
        });
        
        labels.push(this.formatDate(currentDate));
        data.push(result ? parseInt(result.daily_orders) : 0);
        
        currentDate.setDate(currentDate.getDate() + 1);
      }

      return { labels, data };
    } catch (error) {
      logger.error('Error getting order trend:', error);
      return { labels: [], data: [] };
    }
  }

  async getBusinessRevenue(businessIds, startDate, endDate) {
    try {
      const results = await database.query('orders as o')
        .select(
          'g.business_name',
          database.query.raw('SUM(o.total_revenue) as business_revenue')
        )
        .join('groups as g', 'o.business_id', 'g.business_id')
        .whereIn('o.business_id', businessIds)
        .where('o.created_at', '>=', startDate)
        .where('o.created_at', '<=', endDate)
        .groupBy('g.business_name')
        .orderBy('business_revenue', 'desc');

      return {
        labels: results.map(r => r.business_name),
        data: results.map(r => parseFloat(r.business_revenue))
      };
    } catch (error) {
      logger.error('Error getting business revenue:', error);
      return { labels: [], data: [] };
    }
  }

  async getBusinessOrders(businessIds, startDate, endDate) {
    try {
      const results = await database.query('orders as o')
        .select(
          'g.business_name',
          database.query.raw('COUNT(o.id) as business_orders')
        )
        .join('groups as g', 'o.business_id', 'g.business_id')
        .whereIn('o.business_id', businessIds)
        .where('o.created_at', '>=', startDate)
        .where('o.created_at', '<=', endDate)
        .groupBy('g.business_name')
        .orderBy('business_orders', 'desc');

      return {
        labels: results.map(r => r.business_name),
        data: results.map(r => parseInt(r.business_orders))
      };
    } catch (error) {
      logger.error('Error getting business orders:', error);
      return { labels: [], data: [] };
    }
  }

  async getOrderStatus(businessIds, startDate, endDate) {
    try {
      const results = await database.query('orders')
        .select(
          'status',
          database.query.raw('COUNT(*) as status_count')
        )
        .whereIn('business_id', businessIds)
        .where('created_at', '>=', startDate)
        .where('created_at', '<=', endDate)
        .groupBy('status');

      const statusMap = {
        'pending': 'Pending',
        'processing': 'Processing',
        'delivered': 'Delivered',
        'cancelled': 'Cancelled'
      };

      return {
        labels: results.map(r => statusMap[r.status] || r.status),
        data: results.map(r => parseInt(r.status_count))
      };
    } catch (error) {
      logger.error('Error getting order status:', error);
      return { labels: [], data: [] };
    }
  }

  async getMonthlyComparison(businessIds) {
    try {
      const currentMonth = new Date();
      const previousMonth = new Date();
      previousMonth.setMonth(previousMonth.getMonth() - 1);

      const [currentMonthData, previousMonthData] = await Promise.all([
        this.getPeriodData(businessIds, new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1), currentMonth),
        this.getPeriodData(businessIds, new Date(previousMonth.getFullYear(), previousMonth.getMonth(), 1), new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 0))
      ]);

      return {
        current: currentMonthData.totalRevenue,
        previous: previousMonthData.totalRevenue
      };
    } catch (error) {
      logger.error('Error getting monthly comparison:', error);
      return { current: 0, previous: 0 };
    }
  }

  async getCustomerData(businessIds, startDate, endDate) {
    try {
      const previousStartDate = new Date(startDate);
      previousStartDate.setDate(previousStartDate.getDate() - (endDate - startDate) / (1000 * 60 * 60 * 24));

      const [currentCustomers, previousCustomers] = await Promise.all([
        database.query('orders')
          .select(database.query.raw('COUNT(DISTINCT customer_phone) as unique_customers'))
          .whereIn('business_id', businessIds)
          .where('created_at', '>=', startDate)
          .where('created_at', '<=', endDate)
          .first(),
        database.query('orders')
          .select(database.query.raw('COUNT(DISTINCT customer_phone) as unique_customers'))
          .whereIn('business_id', businessIds)
          .where('created_at', '>=', previousStartDate)
          .where('created_at', '<=', startDate)
          .first()
      ]);

      return {
        activeCustomers: parseInt(currentCustomers.unique_customers) || 0,
        previousActiveCustomers: parseInt(previousCustomers.unique_customers) || 0
      };
    } catch (error) {
      logger.error('Error getting customer data:', error);
      return { activeCustomers: 0, previousActiveCustomers: 0 };
    }
  }

  calculateChange(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  formatDate(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  getBestPerformingDay(revenueTrend) {
    if (revenueTrend.data.length === 0) return 'N/A';
    const maxIndex = revenueTrend.data.indexOf(Math.max(...revenueTrend.data));
    return revenueTrend.labels[maxIndex];
  }

  getPeakOrderDay(orderTrend) {
    if (orderTrend.data.length === 0) return 'N/A';
    const maxIndex = orderTrend.data.indexOf(Math.max(...orderTrend.data));
    return orderTrend.labels[maxIndex];
  }

  calculateCompletionRate(orderStatus) {
    const delivered = orderStatus.data[orderStatus.labels.indexOf('Delivered')] || 0;
    const total = orderStatus.data.reduce((sum, count) => sum + count, 0);
    return total > 0 ? (delivered / total) * 100 : 0;
  }

  calculateAvgProcessingTime(totalOrders) {
    // Simplified calculation - in a real app, you'd track actual processing times
    return totalOrders > 0 ? Math.round(24 / totalOrders * 10) : 0;
  }

  getEmptyAnalyticsData() {
    return {
      overview: {
        totalRevenue: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        activeCustomers: 0,
        revenueChange: 0,
        orderChange: 0,
        aovChange: 0,
        customerChange: 0
      },
      revenueTrend: { labels: [], data: [] },
      orderTrend: { labels: [], data: [] },
      businessRevenue: { labels: [], data: [] },
      businessOrders: { labels: [], data: [] },
      orderStatus: { labels: [], data: [] },
      monthlyComparison: { current: 0, previous: 0 },
      customerData: { activeCustomers: 0, previousActiveCustomers: 0 },
      highestDailyRevenue: 0,
      lowestDailyRevenue: 0,
      revenueGrowthRate: 0,
      bestPerformingDay: 'N/A',
      completionRate: 0,
      avgProcessingTime: 0,
      peakOrderDay: 'N/A',
      orderGrowthRate: 0
    };
  }
}

module.exports = new AnalyticsService(); 