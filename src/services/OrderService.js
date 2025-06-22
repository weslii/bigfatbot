const database = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class OrderService {
  async createOrder(businessId, orderData) {
    try {
      const orderId = uuidv4();
      const [order] = await database.query('orders')
        .insert({
          id: orderId,
          customer_name: orderData.customer_name,
          items: orderData.items,
          total_amount: orderData.total_amount,
          status: 'pending',
          business_id: orderData.business_id
        })
        .returning('*');
      return order;
    } catch (error) {
      logger.error('Error creating order:', error);
      throw error;
    }
  }

  async getOrderById(orderId) {
    try {
      const result = await database.query.query(
        'SELECT * FROM orders WHERE order_id = $1 AND business_id = $2',
        [orderId, businessId]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting order:', error);
      throw error;
    }
  }

  async updateOrderStatus(orderId, status, deliveryPerson = null) {
    try {
      const result = await database.query.query(
        'UPDATE orders SET status = $1, updated_by = $2, updated_at = NOW() WHERE order_id = $3 AND business_id = $4 RETURNING *',
        [status, updatedBy, orderId, businessId]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating order status:', error);
      throw error;
    }
  }

  async getPendingOrders(businessId) {
    try {
      const result = await database.query.query(
        'SELECT * FROM orders WHERE business_id = $1 AND status = $2 ORDER BY created_at DESC',
        [businessId, 'pending']
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting pending orders:', error);
      throw error;
    }
  }

  async getDailyReport(businessId) {
    try {
      const result = await database.query.query(
        `SELECT 
          COUNT(*) as total_orders,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered_orders,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
          SUM(CASE WHEN status = 'delivered' THEN total_amount ELSE 0 END) as total_revenue
        FROM orders 
        WHERE business_id = $1 
        AND created_at >= NOW() - INTERVAL '1 day'`,
        [businessId]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting daily report:', error);
      throw error;
    }
  }

  async getWeeklyReport(businessId) {
    try {
      const result = await database.query.query(
        `SELECT 
          COUNT(*) as total_orders,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered_orders,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
          SUM(CASE WHEN status = 'delivered' THEN total_amount ELSE 0 END) as total_revenue
        FROM orders 
        WHERE business_id = $1 
        AND created_at >= NOW() - INTERVAL '7 days'`,
        [businessId]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting weekly report:', error);
      throw error;
    }
  }

  async getMonthlyReport(businessId) {
    try {
      const result = await database.query.query(
        `SELECT 
          COUNT(*) as total_orders,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered_orders,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
          SUM(CASE WHEN status = 'delivered' THEN total_amount ELSE 0 END) as total_revenue
        FROM orders 
        WHERE business_id = $1 
        AND created_at >= NOW() - INTERVAL '30 days'`,
        [businessId]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting monthly report:', error);
      throw error;
    }
  }

  async getUserOrderStats(userId) {
    try {
      // Get all business IDs for the user
      const userBusinesses = await database.query('groups')
        .select('business_id')
        .where('user_id', userId)
        .groupBy('business_id');

      const businessIds = userBusinesses.map(b => b.business_id);

      if (businessIds.length === 0) {
        return {
          totalOrders: 0,
          activeOrders: 0,
          completedOrders: 0
        };
      }

      // Get order statistics across all user's businesses
      const stats = await database.query('orders')
        .select(
          database.query.raw('COUNT(*) as total_orders'),
          database.query.raw('SUM(CASE WHEN status = \'pending\' OR status = \'processing\' THEN 1 ELSE 0 END) as active_orders'),
          database.query.raw('SUM(CASE WHEN status = \'delivered\' OR status = \'completed\' THEN 1 ELSE 0 END) as completed_orders')
        )
        .whereIn('business_id', businessIds)
        .first();

      return {
        totalOrders: parseInt(stats.total_orders) || 0,
        activeOrders: parseInt(stats.active_orders) || 0,
        completedOrders: parseInt(stats.completed_orders) || 0
      };
    } catch (error) {
      logger.error('Error getting user order stats:', error);
      return {
        totalOrders: 0,
        activeOrders: 0,
        completedOrders: 0
      };
    }
  }

  async getUserRecentOrders(userId, limit = 10) {
    try {
      // Get all business IDs for the user
      const userBusinesses = await database.query('groups')
        .select('business_id')
        .where('user_id', userId)
        .groupBy('business_id');

      const businessIds = userBusinesses.map(b => b.business_id);

      if (businessIds.length === 0) {
        return [];
      }

      // Get recent orders across all user's businesses with business names
      const orders = await database.query('orders as o')
        .select(
          'o.*',
          'g.business_name'
        )
        .join('groups as g', 'o.business_id', 'g.business_id')
        .whereIn('o.business_id', businessIds)
        .orderBy('o.created_at', 'desc')
        .limit(limit);

      return orders;
    } catch (error) {
      logger.error('Error getting user recent orders:', error);
      return [];
    }
  }

  async getBusinessOrders(businessId, filters = {}) {
    try {
      let query = database.query('orders as o')
        .select(
          'o.*',
          'g.business_name'
        )
        .join('groups as g', 'o.business_id', 'g.business_id')
        .where('o.business_id', businessId);

      // Apply filters
      if (filters.status) {
        query = query.where('o.status', filters.status);
      }

      if (filters.search) {
        query = query.where(function() {
          this.where('o.customer_name', 'ilike', `%${filters.search}%`)
            .orWhere('o.order_id', 'ilike', `%${filters.search}%`);
        });
      }

      const orders = await query
        .orderBy('o.created_at', 'desc')
        .limit(filters.limit || 50);

      return orders;
    } catch (error) {
      logger.error('Error getting business orders:', error);
      return [];
    }
  }
}

module.exports = new OrderService(); 