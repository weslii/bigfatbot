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
}

module.exports = new OrderService(); 