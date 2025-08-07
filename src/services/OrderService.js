const database = require('../config/database');
const logger = require('../utils/logger');
const cacheService = require('./CacheService');
const InventoryMatchingService = require('./InventoryMatchingService');
const HumanConfirmationService = require('./HumanConfirmationService');
const InventoryService = require('./InventoryService');
const { v4: uuidv4 } = require('uuid');

class OrderService {
  constructor() {
    this.matchingService = new InventoryMatchingService();
    this.confirmationService = null; // Will be set by message handler
  }

  async createOrder(businessId, orderData, confirmationService = null) {
    try {
      // Generate a random 3-letter uppercase code
      function randomCode() {
        return Math.random().toString(36).substring(2, 5).toUpperCase();
      }

      let orderId, serialNumber = '001', maxRetries = 5, attempt = 0, todayOrder;
      const today = new Date();
      const dateStr = today.getFullYear().toString() + 
                     (today.getMonth() + 1).toString().padStart(2, '0') + 
                     today.getDate().toString().padStart(2, '0');
      let code;
      while (attempt < maxRetries) {
        code = randomCode();
        // Get the max serial number for today's orders for this code
        todayOrder = await database.query('orders')
          .where('order_id', 'like', `${code}-${dateStr}-%`)
          .orderBy('order_id', 'desc')
          .first();
        serialNumber = '001';
        if (todayOrder && todayOrder.order_id) {
          const parts = todayOrder.order_id.split('-');
          if (parts.length === 3 && !isNaN(parts[2])) {
            serialNumber = (parseInt(parts[2], 10) + 1).toString().padStart(3, '0');
          }
        }
        orderId = `${code}-${dateStr}-${serialNumber}`;
        // Check if this orderId already exists
        const exists = await database.query('orders').where('order_id', orderId).first();
        if (!exists) break;
        attempt++;
      }
      if (attempt === maxRetries) {
        throw new Error('Failed to generate unique order ID after multiple attempts');
      }
      
      // Perform inventory matching
      const matchingResult = await this.matchingService.matchOrderItems(orderData, businessId);
      
      // Only store matched_items if we have actual matches
      const matchedItemsToStore = matchingResult.status === 'needs_clarification' ? null : (matchingResult.matchedItems.length > 0 ? JSON.stringify(matchingResult.matchedItems) : null);
      
      const [order] = await database.query('orders')
        .insert({
          id: uuidv4(),
          order_id: orderId,
          customer_name: orderData.customer_name,
          customer_phone: orderData.customer_phone,
          address: orderData.address,
          items: orderData.items || null,
          delivery_date: orderData.delivery_date,
          notes: orderData.notes,
          status: 'pending',
          business_id: businessId || orderData.business_id,
          total_revenue: matchingResult.totalRevenue,
          matched_items: matchedItemsToStore,
          matching_confidence: matchingResult.confidence,
          matching_status: matchingResult.status
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
      
      // Handle different matching statuses
      if (matchingResult.status === 'needs_confirmation') {
        await this.handleConfirmationRequired(order, matchingResult, businessId, confirmationService);
      } else if (matchingResult.status === 'needs_clarification') {
        await this.handleClarificationRequired(order, matchingResult, businessId, confirmationService);
      } else if (matchingResult.status === 'completed') {
        // Reduce stock for automatically completed orders
        await this.reduceStockForCompletedOrder(matchingResult.matchedItems, businessId);
      }

      // Record analytics
      await this.recordMatchingAnalytics(businessId, matchingResult);

      return order;
    } catch (error) {
      logger.error('Error creating order:', error);
      throw error;
    }
  }

  async handleConfirmationRequired(order, matchingResult, businessId, confirmationService = null) {
    try {
      if (!confirmationService && !this.confirmationService) {
        logger.warn('Confirmation service not available');
        return;
      }
      
      const service = confirmationService || this.confirmationService;

      // Get group info for this business
      const group = await database.query('groups')
        .where('business_id', businessId)
        .where('group_type', 'sales')
        .first();

      if (!group) {
        logger.error('No sales group found for business', { businessId });
        return;
      }

      // Get inventory for confirmation
      const inventory = await this.matchingService.inventoryService.getBusinessInventoryOptimized(businessId);

      // Request confirmation for each item that needs it
      for (const item of matchingResult.matchedItems) {
        if (item.confidence < 0.65 || item.needsClarification) {
          await service.requestItemConfirmation(
            item.originalItem,
            businessId,
            group.group_id,
            inventory
          );
        }
      }

      logger.info('Requested confirmation for order', {
        orderId: order.order_id,
        businessId,
        groupId: group.group_id,
        itemsNeedingConfirmation: matchingResult.matchedItems.filter(item => item.confidence < 0.65 || item.needsClarification).length
      });
    } catch (error) {
      logger.error('Error handling confirmation required:', error);
    }
  }

  async handleClarificationRequired(order, matchingResult, businessId, confirmationService = null) {
    try {
      logger.info('handleClarificationRequired called:', {
        orderId: order.order_id,
        businessId,
        hasConfirmationService: !!(confirmationService || this.confirmationService)
      });
      
      if (!confirmationService && !this.confirmationService) {
        logger.warn('Confirmation service not available');
        return;
      }
      
      const service = confirmationService || this.confirmationService;

      // Get group info for this business
      const group = await database.query('groups')
        .where('business_id', businessId)
        .where('group_type', 'sales')
        .first();

      if (!group) {
        logger.error('No sales group found for business', { businessId });
        return;
      }

      // Use the confirmation system to handle clarification
      logger.info('handleClarificationRequired: Sending clarification message via OrderService path');
      await service.requestItemConfirmation(
        { name: 'Clarification needed', quantity: 1 },
        businessId,
        group.group_id,
        matchingResult.inventory || []
      );

      logger.info('Requested clarification for order', {
        orderId: order.order_id,
        businessId,
        groupId: group.group_id,
        message: matchingResult.message
      });
    } catch (error) {
      logger.error('Error handling clarification required:', error);
    }
  }

  async recordMatchingAnalytics(businessId, matchingResult) {
    try {
      const analytics = {
        business_id: businessId,
        total_items: matchingResult.matchedItems.length,
        auto_matched: matchingResult.matchedItems.filter(item => item.confidence >= 0.85).length,
        ai_matched: matchingResult.matchedItems.filter(item => item.confidence >= 0.65 && item.confidence < 0.85).length,
        human_confirmed: matchingResult.matchedItems.filter(item => item.confidence < 0.65).length,
        total_revenue: matchingResult.totalRevenue,
        average_confidence: matchingResult.confidence,
        created_at: new Date()
      };
      
      await database.query('matching_analytics').insert(analytics);
    } catch (error) {
      logger.error('Error recording analytics:', error);
    }
  }

  async reduceStockForCompletedOrder(matchedItems, businessId) {
    try {
      for (const item of matchedItems) {
        // Only reduce stock for products (not for 'other' items)
        if (item.matchedItem.type === 'product') {
          try {
            await InventoryService.updateStock(
              item.matchedItem.id, 
              businessId, 
              -item.quantity
            );
            
            logger.info('Stock reduced for automatically completed order', {
              productId: item.matchedItem.id,
              productName: item.matchedItem.name,
              quantityReduced: item.quantity,
              businessId: businessId
            });
          } catch (error) {
            logger.error('Error reducing stock for product in automatic order:', error);
            // Don't fail the entire order if one item's stock reduction fails
          }
        }
      }
    } catch (error) {
      logger.error('Error reducing stock for completed order:', error);
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
      
      // Clear any corrupted cache first
      try {
        await cacheService.invalidateOrderStats(userIdString);
      } catch (cacheError) {
        logger.warn('Cache clear failed, proceeding:', cacheError.message);
      }
      
      // Try to get from cache first (with graceful fallback)
      let cachedStats = null;
      try {
        cachedStats = await cacheService.getOrderStats(userIdString);
      } catch (cacheError) {
        logger.warn('Cache get failed, proceeding without cache:', cacheError.message);
      }
      if (cachedStats && typeof cachedStats === 'object' && cachedStats.totalOrders !== undefined) {
        return cachedStats;
      }

      // Get all business IDs for the user
      const userBusinesses = await database.query('groups')
        .select('business_id')
        .where('user_id', userIdString)
        .groupBy('business_id');

      const businessIds = userBusinesses.map(b => b.business_id);

      if (businessIds.length === 0) {
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
        return emptyStats;
      }

      // Get order statistics across all user's businesses
      const stats = await database.query('orders')
        .select(
          database.query.raw('COUNT(*) as total_orders'),
          database.query.raw('SUM(CASE WHEN status = \'pending\' OR status = \'processing\' THEN 1 ELSE 0 END) as pending_orders'),
          database.query.raw('SUM(CASE WHEN status = \'delivered\' THEN 1 ELSE 0 END) as completed_orders')
        )
        .whereIn('business_id', businessIds)
        .first();

      const result = {
        totalOrders: parseInt(stats.total_orders) || 0,
        completedOrders: parseInt(stats.completed_orders) || 0,
        pendingOrders: parseInt(stats.pending_orders) || 0
      };

      try {
        await cacheService.setOrderStats(userIdString, result, 600);
      } catch (cacheError) {
        logger.warn('Cache set failed for user stats:', cacheError.message);
      }
      
      return result;
    } catch (error) {
      logger.error('Error getting user order stats:', error);
      return {
        totalOrders: 0,
        completedOrders: 0,
        pendingOrders: 0
      };
    }
  }

  async getUserRevenueStats(userId) {
    try {
      // Ensure userId is a string - fix for object conversion issue
      const userIdString = String(userId);
      
      // Get all business IDs for the user
      const userBusinesses = await database.query('groups')
        .select('business_id')
        .where('user_id', userIdString)
        .groupBy('business_id');

      const businessIds = userBusinesses.map(b => b.business_id);

      if (businessIds.length === 0) {
        return {
          totalRevenue: 0,
          todayRevenue: 0,
          weekRevenue: 0,
          monthRevenue: 0
        };
      }

      // Get revenue statistics across all user's businesses
      const [totalStats, todayStats, weekStats, monthStats] = await Promise.all([
        // Total revenue
        database.query('orders')
          .select(database.query.raw('SUM(total_revenue) as total_revenue'))
          .whereIn('business_id', businessIds)
          .first(),
        
        // Today's revenue
        database.query('orders')
          .select(database.query.raw('SUM(total_revenue) as today_revenue'))
          .whereIn('business_id', businessIds)
          .where('created_at', '>=', database.query.raw('NOW() - INTERVAL \'1 day\''))
          .first(),
        
        // This week's revenue
        database.query('orders')
          .select(database.query.raw('SUM(total_revenue) as week_revenue'))
          .whereIn('business_id', businessIds)
          .where('created_at', '>=', database.query.raw('NOW() - INTERVAL \'7 days\''))
          .first(),
        
        // This month's revenue
        database.query('orders')
          .select(database.query.raw('SUM(total_revenue) as month_revenue'))
          .whereIn('business_id', businessIds)
          .where('created_at', '>=', database.query.raw('NOW() - INTERVAL \'30 days\''))
          .first()
      ]);

      const result = {
        totalRevenue: parseFloat(totalStats.total_revenue) || 0,
        todayRevenue: parseFloat(todayStats.today_revenue) || 0,
        weekRevenue: parseFloat(weekStats.week_revenue) || 0,
        monthRevenue: parseFloat(monthStats.month_revenue) || 0
      };
      
      return result;
    } catch (error) {
      logger.error('Error getting user revenue stats:', error);
      return {
        totalRevenue: 0,
        todayRevenue: 0,
        weekRevenue: 0,
        monthRevenue: 0
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