const database = require('../config/database');
const logger = require('../utils/logger');
const cacheService = require('./CacheService');
const { v4: uuidv4 } = require('uuid');

class OrderService {
  async createOrder(businessId, orderData) {
    try {
      // Generate simple order ID: YYYYMMDD-XXX format
      const today = new Date();
      const dateStr = today.getFullYear().toString() + 
                     (today.getMonth() + 1).toString().padStart(2, '0') + 
                     today.getDate().toString().padStart(2, '0');
      
      // Get today's order count for this business to generate serial number
      const todayOrders = await database.query('orders')
        .where('business_id', businessId)
        .where('created_at', '>=', database.query.raw('DATE(NOW())'))
        .count('* as count')
        .first();
      
      const serialNumber = (parseInt(todayOrders.count) + 1).toString().padStart(3, '0');
      const orderId = `${dateStr}-${serialNumber}`;
      
      const [order] = await database.query('orders')
        .insert({
          id: uuidv4(),
          order_id: orderId,
          customer_name: orderData.customer_name,
          customer_phone: orderData.customer_phone,
          address: orderData.address,
          items: orderData.items,
          delivery_date: orderData.delivery_date,
          notes: orderData.notes,
          status: 'pending',
          business_id: businessId || orderData.business_id
        })
        .returning('*');

      // Invalidate cache for this business
      await cacheService.invalidateBusinessOrders(businessId || orderData.business_id);
      
      // Invalidate user's order stats cache
      try {
        const userBusinesses = await database.query('groups')
          .select('user_id')
          .where('business_id', businessId || orderData.business_id)
          .groupBy('user_id');
        
        for (const business of userBusinesses) {
          await cacheService.invalidateOrderStats(business.user_id);
        }
      } catch (cacheError) {
        logger.warn('Failed to invalidate user order stats cache:', cacheError.message);
      }
      
      return order;
    } catch (error) {
      logger.error('Error creating order:', error);
      throw error;
    }
  }

  async getOrderById(orderId, businessId) {
    try {
      const order = await database.query('orders')
        .where('order_id', orderId)
        .where('business_id', businessId)
        .first();
      return order;
    } catch (error) {
      logger.error('Error getting order:', error);
      throw error;
    }
  }

  async updateOrderStatus(orderId, status, deliveryPerson, businessId) {
    try {
      const result = await database.query('orders')
        .where('order_id', orderId)
        .where('business_id', businessId)
        .update({ 
          status: status,
          delivery_person: deliveryPerson,
          updated_by: deliveryPerson,
          updated_at: database.query.fn.now()
        })
        .returning('*');
      
      // Invalidate user's order stats cache
      try {
        const userBusinesses = await database.query('groups')
          .select('user_id')
          .where('business_id', businessId)
          .groupBy('user_id');
        
        for (const business of userBusinesses) {
          await cacheService.invalidateOrderStats(business.user_id);
        }
      } catch (cacheError) {
        logger.warn('Failed to invalidate user order stats cache:', cacheError.message);
      }
      
      return result[0];
    } catch (error) {
      logger.error('Error updating order status:', error);
      throw error;
    }
  }

  async getPendingOrders(businessId) {
    try {
      const orders = await database.query('orders')
        .where('business_id', businessId)
        .where('status', 'pending')
        .orderBy('created_at', 'desc');
      return orders;
    } catch (error) {
      logger.error('Error getting pending orders:', error);
      throw error;
    }
  }

  async getDailyReport(businessId) {
    try {
      const report = await database.query('orders')
        .select(
          database.query.raw('COUNT(*) as total_orders'),
          database.query.raw('SUM(CASE WHEN status = \'delivered\' THEN 1 ELSE 0 END) as delivered_orders'),
          database.query.raw('SUM(CASE WHEN status = \'cancelled\' THEN 1 ELSE 0 END) as cancelled_orders'),
          database.query.raw('SUM(CASE WHEN status = \'pending\' THEN 1 ELSE 0 END) as scheduled_deliveries')
        )
        .where('business_id', businessId)
        .where('created_at', '>=', database.query.raw('NOW() - INTERVAL \'1 day\''))
        .first();
      return report;
    } catch (error) {
      logger.error('Error getting daily report:', error);
      throw error;
    }
  }

  async getWeeklyReport(businessId) {
    try {
      const report = await database.query('orders')
        .select(
          database.query.raw('COUNT(*) as total_orders'),
          database.query.raw('SUM(CASE WHEN status = \'delivered\' THEN 1 ELSE 0 END) as delivered_orders'),
          database.query.raw('SUM(CASE WHEN status = \'cancelled\' THEN 1 ELSE 0 END) as cancelled_orders'),
          database.query.raw('SUM(CASE WHEN status = \'pending\' THEN 1 ELSE 0 END) as scheduled_deliveries')
        )
        .where('business_id', businessId)
        .where('created_at', '>=', database.query.raw('NOW() - INTERVAL \'7 days\''))
        .first();
      return report;
    } catch (error) {
      logger.error('Error getting weekly report:', error);
      throw error;
    }
  }

  async getMonthlyReport(businessId) {
    try {
      const report = await database.query('orders')
        .select(
          database.query.raw('COUNT(*) as total_orders'),
          database.query.raw('SUM(CASE WHEN status = \'delivered\' THEN 1 ELSE 0 END) as delivered_orders'),
          database.query.raw('SUM(CASE WHEN status = \'cancelled\' THEN 1 ELSE 0 END) as cancelled_orders'),
          database.query.raw('SUM(CASE WHEN status = \'pending\' THEN 1 ELSE 0 END) as scheduled_deliveries')
        )
        .where('business_id', businessId)
        .where('created_at', '>=', database.query.raw('NOW() - INTERVAL \'30 days\''))
        .first();
      return report;
    } catch (error) {
      logger.error('Error getting monthly report:', error);
      throw error;
    }
  }

  async getUserOrderStats(userId) {
    try {
      // Ensure userId is a string - fix for object conversion issue
      const userIdString = String(userId);
      logger.info('[OrderStats] Starting getUserOrderStats with userId:', userIdString, 'type:', typeof userIdString);
      logger.info('[OrderStats] Original userId was:', userId, 'type:', typeof userId);
      
      // Clear any corrupted cache first
      try {
        await cacheService.invalidateOrderStats(userIdString);
        logger.info('[OrderStats] Cleared cache for userId:', userIdString);
      } catch (cacheError) {
        logger.warn('Cache clear failed, proceeding:', cacheError.message);
      }
      
      // Try to get from cache first (with graceful fallback)
      let cachedStats = null;
      try {
        cachedStats = await cacheService.getOrderStats(userIdString);
        logger.info('[OrderStats] Cache lookup result:', cachedStats);
      } catch (cacheError) {
        logger.warn('Cache get failed, proceeding without cache:', cacheError.message);
      }
      if (cachedStats && typeof cachedStats === 'object' && cachedStats.totalOrders !== undefined) {
        logger.info('[OrderStats] Returning cached stats:', cachedStats);
        return cachedStats;
      } else {
        logger.info('[OrderStats] Cache miss or invalid cache data, proceeding with fresh query');
      }
      
      // Get all business IDs for the user
      logger.info('[OrderStats] Querying groups table for user_id:', userIdString);
      const userBusinesses = await database.query('groups')
        .select('business_id')
        .where('user_id', userIdString)
        .groupBy('business_id');
      
      logger.info('[OrderStats] Groups query result:', userBusinesses);
      const businessIds = userBusinesses.map(b => b.business_id);
      logger.info('[OrderStats] Extracted businessIds:', businessIds);
      
      if (businessIds.length === 0) {
        logger.info('[OrderStats] No businesses found for userId:', userIdString);
        const emptyStats = {
          totalOrders: 0,
          completedOrders: 0,
          pendingOrders: 0
        };
        try {
          await cacheService.setOrderStats(userIdString, emptyStats, 300);
        } catch (cacheError) {
          logger.warn('Cache set failed for empty stats:', cacheError.message);
        }
        logger.info('[OrderStats] Returning empty stats');
        return emptyStats;
      }
      
      // Get order statistics across all user's businesses
      logger.info('[OrderStats] Querying orders table for businessIds:', businessIds);
      const stats = await database.query('orders')
        .select(
          database.query.raw('COUNT(*) as total_orders'),
          database.query.raw('SUM(CASE WHEN status = \'pending\' OR status = \'processing\' THEN 1 ELSE 0 END) as pending_orders'),
          database.query.raw('SUM(CASE WHEN status = \'delivered\' THEN 1 ELSE 0 END) as completed_orders')
        )
        .whereIn('business_id', businessIds)
        .first();
      
      logger.info('[OrderStats] Orders query raw result:', stats);
      const result = {
        totalOrders: parseInt(stats.total_orders) || 0,
        completedOrders: parseInt(stats.completed_orders) || 0,
        pendingOrders: parseInt(stats.pending_orders) || 0
      };
      
      logger.info('[OrderStats] Final processed result:', result);
      
      try {
        await cacheService.setOrderStats(userIdString, result, 600);
        logger.info('[OrderStats] Successfully cached result');
      } catch (cacheError) {
        logger.warn('Cache set failed for user stats:', cacheError.message);
      }
      
      logger.info('[OrderStats] Returning final result:', result);
      return result;
    } catch (error) {
      logger.error('[OrderStats] Error in getUserOrderStats:', error);
      logger.error('[OrderStats] Error stack:', error.stack);
      return {
        totalOrders: 0,
        completedOrders: 0,
        pendingOrders: 0
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
      // Use the same approach as the orders page to avoid duplicates
      const orders = await database.query('orders as o')
        .select(
          'o.*',
          database.query.raw('(SELECT business_name FROM groups WHERE business_id = o.business_id AND user_id = ? LIMIT 1) as business_name', [userId])
        )
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
      // Try to get from cache first (with graceful fallback)
      let cachedOrders = null;
      try {
        cachedOrders = await cacheService.getBusinessOrders(businessId, filters);
      } catch (cacheError) {
        logger.warn('Cache get failed for business orders, proceeding without cache:', cacheError.message);
      }
      
      if (cachedOrders) {
        return cachedOrders;
      }

      const {
        status,
        search,
        page = 1,
        pageSize = 20,
        startDate,
        endDate
      } = filters;

      let query = database.query('orders')
        .where('business_id', businessId);

      // Apply filters
      if (status) {
        query = query.where('status', status);
      }

      if (search) {
        query = query.where(function() {
          this.where('customer_name', 'ilike', `%${search}%`)
            .orWhere('order_id', 'ilike', `%${search}%`)
            .orWhere('customer_phone', 'ilike', `%${search}%`);
        });
      }

      if (startDate) {
        query = query.where('created_at', '>=', startDate);
      }

      if (endDate) {
        query = query.where('created_at', '<=', endDate);
      }

      // Get total count for pagination
      const countQuery = query.clone();
      const totalOrders = await countQuery.count('* as count').first();

      // Apply pagination
      const offset = (page - 1) * pageSize;
      const orders = await query
        .orderBy('created_at', 'desc')
        .limit(pageSize)
        .offset(offset);

      const result = {
        orders,
        pagination: {
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalOrders: parseInt(totalOrders.count),
          totalPages: Math.ceil(totalOrders.count / pageSize)
        }
      };

      // Try to cache the result (with graceful fallback)
      try {
        await cacheService.setBusinessOrders(businessId, result, filters, 300);
      } catch (cacheError) {
        logger.warn('Cache set failed for business orders:', cacheError.message);
      }
      
      return result;
    } catch (error) {
      logger.error('Error getting business orders:', error);
      return {
        orders: [],
        pagination: {
          page: 1,
          pageSize: 20,
          totalOrders: 0,
          totalPages: 0
        }
      };
    }
  }
}

module.exports = new OrderService(); 