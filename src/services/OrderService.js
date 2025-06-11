const database = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class OrderService {
  async createOrder(businessId, orderData) {
    try {
      const orderId = uuidv4();
      const result = await database.query(
        `INSERT INTO orders (
          order_id, business_id, customer_name, customer_phone, 
          address, items, delivery_date, status, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
        RETURNING *`,
        [
          orderId,
          businessId,
          orderData.customer_name,
          orderData.customer_phone,
          orderData.address,
          orderData.items,
          orderData.delivery_date || null,
          'pending',
          orderData.notes || null
        ]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating order:', error);
      throw error;
    }
  }

  async getOrderById(orderId) {
    try {
      const result = await database.query(
        'SELECT * FROM orders WHERE order_id = $1',
        [orderId]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting order:', error);
      throw error;
    }
  }

  async updateOrderStatus(orderId, status, deliveryPerson = null) {
    try {
      const result = await database.query(
        `UPDATE orders 
         SET status = $1, 
             delivery_person = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $3 
         RETURNING *`,
        [status, deliveryPerson, orderId]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating order status:', error);
      throw error;
    }
  }

  async getPendingOrders(businessId) {
    try {
      const result = await database.query(
        `SELECT * FROM orders 
         WHERE business_id = $1 
         AND status = 'pending'
         ORDER BY created_at DESC`,
        [businessId]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting pending orders:', error);
      throw error;
    }
  }

  async getDailyReport(businessId) {
    try {
      const result = await database.query(
        `SELECT 
          COUNT(*) as total_orders,
          COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
          COUNT(CASE WHEN delivery_date = CURRENT_DATE THEN 1 END) as scheduled_deliveries
         FROM orders 
         WHERE business_id = $1 
         AND DATE(created_at) = CURRENT_DATE`,
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
      const result = await database.query(
        `SELECT 
          COUNT(*) as total_orders,
          COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
          COUNT(CASE WHEN delivery_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' THEN 1 END) as scheduled_deliveries
         FROM orders 
         WHERE business_id = $1 
         AND created_at >= CURRENT_DATE - INTERVAL '7 days'`,
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
      const result = await database.query(
        `SELECT 
          COUNT(*) as total_orders,
          COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
          COUNT(CASE WHEN delivery_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days' THEN 1 END) as scheduled_deliveries
         FROM orders 
         WHERE business_id = $1 
         AND created_at >= CURRENT_DATE - INTERVAL '30 days'`,
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