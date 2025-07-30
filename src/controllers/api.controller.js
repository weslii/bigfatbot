// src/controllers/api.controller.js
const WhatsAppService = require('../services/WhatsAppService');
const logger = require('../utils/logger');
const db = require('../config/database');
const { generateOrdersCSV, generateOrdersPDF, generateBusinessesCSV } = require('../utils/exportHelpers');

module.exports = {
  // Health check endpoint
  healthCheck: async (req, res) => {
    try {
      await db.raw('SELECT 1');
      res.status(200).json({
        status: 'ok',
        redis: 'connected',
        database: 'connected'
      });
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(500).json({
        status: 'error',
        redis: 'connected',
        database: 'disconnected',
        error: error.message
      });
    }
  },

  // Memory usage endpoint for monitoring
  getMemoryUsage: (req, res) => {
    try {
      const memoryMonitor = require('../utils/memoryMonitor');
      const memoryUsage = memoryMonitor.getMemoryUsage();
      res.json({
        status: 'ok',
        memory: memoryUsage,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message
      });
    }
  },

  // WhatsApp bot management endpoints
  getBotInfo: async (req, res) => {
    try {
      const whatsappService = WhatsAppService.getInstance();
      const botInfo = await whatsappService.getBotInfo();
      
      res.json({ 
        success: true, 
        ...botInfo
      });
    } catch (error) {
      logger.error('Get bot info error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to get bot info',
        number: 'Not available',
        name: 'WhatsApp Bot',
        status: 'error'
      });
    }
  },

  changeNumber: async (req, res) => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Check if user is admin (you can modify this logic)
      const user = await db.query('users')
        .where('id', userId)
        .first();
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Import WhatsAppService
      const whatsappService = WhatsAppService.getInstance();

      // Call the changeNumber method
      await whatsappService.changeNumber();
      
      res.json({ 
        success: true, 
        message: 'WhatsApp number change initiated. Please restart the bot to complete the process.' 
      });
    } catch (error) {
      logger.error('Change WhatsApp number error:', error);
      res.status(500).json({ error: 'Failed to change WhatsApp number' });
    }
  },

  restartBot: async (req, res) => {
    try {
      // Set the restart_requested flag in the bot_control table
      await db.query('bot_control').where({ id: 1 }).update({ restart_requested: true });
      res.json({ success: true, message: 'Bot restart requested.' });
    } catch (error) {
      logger.error('RestartBot flag error:', error);
      res.status(500).json({ success: false, message: 'Failed to request bot restart.' });
    }
  },

  getQrCode: async (req, res) => {
    try {
      const whatsappService = WhatsAppService.getInstance();
      const qrStatus = whatsappService.getLatestQrStatus();
      res.json(qrStatus);
    } catch (error) {
      logger.error('Get WhatsApp QR code error:', error);
      res.status(500).json({ error: 'Failed to get WhatsApp QR code' });
    }
  },

  // Order management API endpoints
  getOrderDetails: async (req, res) => {
    try {
      const { orderId } = req.params;
      const { userId } = req.query;
      
      // Input validation
      if (!orderId || !userId) {
        return res.status(400).json({ error: 'Order ID and User ID are required' });
      }
      
      // Validate orderId format (should be a UUID)
      if (!/^[a-fA-F0-9-]{36}$/.test(orderId)) {
        return res.status(400).json({ error: 'Invalid order ID format' });
      }
      
      // Get user's business IDs to ensure they can only access their orders
      const userBusinesses = await db.query('groups')
        .select('business_id')
        .where('user_id', userId)
        .groupBy('business_id');
      
      const businessIds = userBusinesses.map(b => b.business_id);
      
      const order = await db.query('orders as o')
        .select(
          'o.*',
          'g.business_name'
        )
        .join('groups as g', 'o.business_id', 'g.business_id')
        .where('o.id', orderId)
        .whereIn('o.business_id', businessIds)
        .first();
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      res.json(order);
    } catch (error) {
      logger.error('Get order details error:', error);
      res.status(500).json({ error: 'Failed to get order details' });
    }
  },

  updateOrderStatus: async (req, res) => {
    try {
      const { orderId } = req.params;
      const { status, userId } = req.body;
      
      // Input validation
      if (!orderId || !status || !userId) {
        return res.status(400).json({ error: 'Order ID, status, and User ID are required' });
      }
      
      // Validate orderId format (should be a UUID)
      if (!/^[a-fA-F0-9-]{36}$/.test(orderId)) {
        return res.status(400).json({ error: 'Invalid order ID format' });
      }
      
      // Validate status
      const validStatuses = ['pending', 'processing', 'delivered', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }
      
      // Get user's business IDs to ensure they can only update their orders
      const userBusinesses = await db.query('groups')
        .select('business_id')
        .where('user_id', userId)
        .groupBy('business_id');
      
      const businessIds = userBusinesses.map(b => b.business_id);
      
      const result = await db.query('orders')
        .where('id', orderId)
        .whereIn('business_id', businessIds)
        .update({ 
          status: status,
          updated_at: new Date()
        });
      
      if (result === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      res.json({ success: true, message: 'Order status updated' });
    } catch (error) {
      logger.error('Update order status error:', error);
      res.status(500).json({ error: 'Failed to update order status' });
    }
  },

  deleteOrder: async (req, res) => {
    try {
      const { orderId } = req.params;
      const { userId } = req.body;
      
      // Input validation
      if (!orderId || !userId) {
        return res.status(400).json({ error: 'Order ID and User ID are required' });
      }
      
      // Validate orderId format (should be a UUID)
      if (!/^[a-fA-F0-9-]{36}$/.test(orderId)) {
        return res.status(400).json({ error: 'Invalid order ID format' });
      }
      
      // Get user's business IDs to ensure they can only delete their orders
      const userBusinesses = await db.query('groups')
        .select('business_id')
        .where('user_id', userId)
        .groupBy('business_id');
      
      const businessIds = userBusinesses.map(b => b.business_id);
      
      // Check if order exists and belongs to user
      const order = await db.query('orders')
        .where('id', orderId)
        .whereIn('business_id', businessIds)
        .first();
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Delete the order
      const result = await db.query('orders')
        .where('id', orderId)
        .whereIn('business_id', businessIds)
        .del();
      
      if (result === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      res.json({ success: true, message: 'Order deleted successfully' });
    } catch (error) {
      logger.error('Delete order error:', error);
      res.status(500).json({ error: 'Failed to delete order' });
    }
  },

  updateOrder: async (req, res) => {
    try {
      const { orderId } = req.params;
      const { userId, ...updateData } = req.body;
      
      // Get user's business IDs to ensure they can only update their orders
      const userBusinesses = await db.query('groups')
        .select('business_id')
        .where('user_id', userId)
        .groupBy('business_id');
      
      const businessIds = userBusinesses.map(b => b.business_id);
      
      const result = await db.query('orders')
        .where('id', orderId)
        .whereIn('business_id', businessIds)
        .update({ 
          ...updateData,
          updated_at: new Date()
        });
      
      if (result === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      res.json({ success: true, message: 'Order updated' });
    } catch (error) {
      logger.error('Update order error:', error);
      res.status(500).json({ error: 'Failed to update order' });
    }
  },

  getOrderCount: async (req, res) => {
    try {
      const { userId, business_id, status, search, count_only } = req.query;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Get user's business IDs
      const userBusinesses = await db.query('groups')
        .select('business_id')
        .where('user_id', userId)
        .groupBy('business_id');
      
      const businessIds = userBusinesses.map(b => b.business_id);
      
      if (businessIds.length === 0) {
        return res.json({ count: 0 });
      }

      // Build query
      let query = db.query('orders as o')
        .join('groups as g', 'o.business_id', 'g.business_id')
        .whereIn('o.business_id', businessIds);

      // Apply filters
      if (business_id) {
        query = query.where('o.business_id', business_id);
      }
      
      if (status) {
        query = query.where('o.status', status);
      }
      
      if (search) {
        query = query.where(function() {
          this.where('o.customer_name', 'like', `%${search}%`)
            .orWhere('o.order_id', 'like', `%${search}%`);
        });
      }

      const count = await query.count('o.id as count').first();
      
      res.json({ count: parseInt(count.count) });
    } catch (error) {
      logger.error('Order count error:', error);
      res.status(500).json({ error: 'Failed to get order count' });
    }
  },

  // Groups API endpoints
  addGroup: async (req, res) => {
    try {
      const { business_id, group_type, group_name, group_id, user_id } = req.body;
      
      // Validate user owns this business
      const business = await db.query('groups')
        .where('business_id', business_id)
        .where('user_id', user_id)
        .first();
      
      if (!business) {
        return res.status(403).json({ error: 'You do not own this business' });
      }

      // Check if group already exists
      const existingGroup = await db.query('groups')
        .where('group_id', group_id)
        .first();
      
      if (existingGroup) {
        return res.status(400).json({ error: 'Group already exists' });
      }

      // Check if this business already has the maximum number of groups (2)
      const groupCount = await db.query('groups')
        .where('business_id', business_id)
        .count('* as count')
        .first();

      if (groupCount.count >= 2) {
        return res.status(400).json({ error: 'This business already has the maximum number of groups (1 sales + 1 delivery)' });
      }

      // Check if this business already has a group of this type
      const existingTypeGroup = await db.query('groups')
        .where('business_id', business_id)
        .where('group_type', group_type)
        .first();

      if (existingTypeGroup) {
        return res.status(400).json({ error: `This business already has a ${group_type} group` });
      }

      // Create group
      await db.query('groups').insert({
        user_id,
        business_id,
        business_name: business.business_name,
        group_name,
        group_id,
        group_type
      });

      res.json({ success: true, message: 'Group added successfully' });
    } catch (error) {
      logger.error('Add group error:', error);
      res.status(500).json({ error: 'Failed to add group' });
    }
  },

  getGroup: async (req, res) => {
    try {
      const { groupId } = req.params;
      const { userId } = req.query;
      
      const group = await db.query('groups')
        .where('id', groupId)
        .where('user_id', userId)
        .first();
      
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }
      
      res.json(group);
    } catch (error) {
      logger.error('Get group error:', error);
      res.status(500).json({ error: 'Failed to get group' });
    }
  },

  deleteGroup: async (req, res) => {
    try {
      const { groupId } = req.params;
      const { userId } = req.query;
      
      const result = await db.query('groups')
        .where('id', groupId)
        .where('user_id', userId)
        .del();
      
      if (result === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }
      
      res.json({ success: true, message: 'Group removed successfully' });
    } catch (error) {
      logger.error('Remove group error:', error);
      res.status(500).json({ error: 'Failed to remove group' });
    }
  },

  // Business API endpoints
  createBusiness: async (req, res) => {
    try {
      const { business_name, description, phone, email, address, user_id } = req.body;
      
      // Validate user
      if (user_id !== req.session.userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Generate business ID
      const businessId = require('uuid').v4();

      // Create business (as a group entry)
      await db.query('groups').insert({
        user_id,
        business_id: businessId,
        business_name,
        group_name: `${business_name} - Main Group`,
        group_id: `default_${businessId}`,
        group_type: 'main'
      });

      res.json({ 
        success: true, 
        message: 'Business created successfully',
        business_id: businessId
      });
    } catch (error) {
      logger.error('Create business error:', error);
      res.status(500).json({ error: 'Failed to create business' });
    }
  },

  updateBusiness: async (req, res) => {
    try {
      const { businessId } = req.params;
      const { business_name, description, phone, email, address, user_id } = req.body;
      
      // Validate user owns this business
      const business = await db.query('groups')
        .where('business_id', businessId)
        .where('user_id', user_id)
        .first();

      if (!business) {
        return res.status(403).json({ error: 'You do not own this business' });
      }

      // Update business name in all related groups
      await db.query('groups')
        .where('business_id', businessId)
        .update({
          business_name,
          updated_at: new Date()
        });

      res.json({ success: true, message: 'Business updated successfully' });
    } catch (error) {
      logger.error('Update business error:', error);
      res.status(500).json({ error: 'Failed to update business' });
    }
  },

  deleteBusiness: async (req, res) => {
    try {
      const { businessId } = req.params;
      const { user_id } = req.query;
      
      // Validate user owns this business
      const business = await db.query('groups')
        .where('business_id', businessId)
        .where('user_id', user_id)
        .first();

      if (!business) {
        return res.status(403).json({ error: 'You do not own this business' });
      }

      // Delete all groups for this business
      await db.query('groups')
        .where('business_id', businessId)
        .del();

      // Delete all orders for this business
      await db.query('orders')
        .where('business_id', businessId)
        .del();

      res.json({ success: true, message: 'Business deleted successfully' });
    } catch (error) {
      logger.error('Delete business error:', error);
      res.status(500).json({ error: 'Failed to delete business' });
    }
  },

  // Settings API endpoints
  updateProfile: async (req, res) => {
    try {
      const { full_name, email, phone, timezone, address, user_id } = req.body;
      
      // Validate user owns this profile
      if (user_id !== req.session.userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Check if email is already taken by another user
      const existingUser = await db.query('users')
        .where('email', email)
        .whereNot('id', user_id)
        .first();

      if (existingUser) {
        return res.status(400).json({ error: 'Email address is already in use' });
      }

      // Update profile
      await db.query('users')
        .where('id', user_id)
        .update({
          full_name,
          email,
          phone,
          timezone,
          address,
          updated_at: new Date()
        });

      res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
      logger.error('Update profile error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  },

  changePassword: async (req, res) => {
    try {
      const { current_password, new_password, user_id } = req.body;
      
      // Validate user owns this account
      if (user_id !== req.session.userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Get user
      const user = await db.query('users')
        .where('id', user_id)
        .first();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Verify current password
      const bcrypt = require('bcrypt');
      const isValidPassword = await bcrypt.compare(current_password, user.password);
      
      if (!isValidPassword) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(new_password, 10);

      // Update password
      await db.query('users')
        .where('id', user_id)
        .update({
          password: hashedPassword,
          updated_at: new Date()
        });

      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      logger.error('Change password error:', error);
      res.status(500).json({ error: 'Failed to change password' });
    }
  },

  updateNotifications: async (req, res) => {
    try {
      const { 
        email_new_orders, 
        email_daily_reports, 
        email_weekly_reports,
        whatsapp_new_orders,
        whatsapp_reminders,
        dashboard_alerts,
        user_id 
      } = req.body;
      
      // Validate user owns this account
      if (user_id !== req.session.userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Update notification preferences
      await db.query('users')
        .where('id', user_id)
        .update({
          email_new_orders,
          email_daily_reports,
          email_weekly_reports,
          whatsapp_new_orders,
          whatsapp_reminders,
          dashboard_alerts,
          updated_at: new Date()
        });

      res.json({ success: true, message: 'Notification preferences saved' });
    } catch (error) {
      logger.error('Update notifications error:', error);
      res.status(500).json({ error: 'Failed to update notification preferences' });
    }
  },

  // Export functionality
  exportOrders: async (req, res) => {
    try {
      const { userId, business_id, status, search, format = 'csv', streaming = 'true' } = req.query;
      // Get userId from session if not provided in query
      const currentUserId = userId || (req.session && req.session.userId ? String(req.session.userId) : null);
      if (!currentUserId) {
        return res.status(400).json({ error: 'User ID is required' });
      }
      
      // Get user's business IDs
      const userBusinesses = await db.query('groups')
        .select('business_id', 'business_name')
        .where('user_id', currentUserId)
        .groupBy('business_id', 'business_name');
      const businessIds = userBusinesses.map(b => b.business_id);
      if (businessIds.length === 0) {
        return res.status(400).json({ error: 'No businesses found for this user' });
      }
      
      // Build query with DISTINCT to prevent duplication
      let query = db.query('orders as o')
        .join('groups as g', 'o.business_id', 'g.business_id')
        .whereIn('o.business_id', businessIds)
        .distinct('o.id') // Prevent duplication
        .select(
          'o.*',
          'g.business_name'
        );
      
      // Apply filters
      if (business_id) {
        query = query.where('o.business_id', business_id);
      }
      if (status) {
        query = query.where('o.status', status);
      }
      if (search) {
        query = query.where(function() {
          this.where('o.customer_name', 'like', `%${search}%`)
            .orWhere('o.order_id', 'like', `%${search}%`);
        });
      }
      
      // For streaming exports (CSV), use pagination
      if (format === 'csv' && streaming === 'true') {
        // Stream CSV directly to response
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
        
        // Write CSV header
        const headers = [
          'Order ID',
          'Business',
          'Customer Name',
          'Customer Phone',
          'Address',
          'Items',
          'Status',
          'Delivery Date',
          'Notes',
          'Created At'
        ];
        res.write(headers.join(',') + '\n');
        
        // Stream orders in batches
        const batchSize = 100;
        let offset = 0;
        let hasMore = true;
        
        while (hasMore) {
          const batch = await query
            .orderBy('o.created_at', 'desc')
            .limit(batchSize)
            .offset(offset);
          
          if (batch.length === 0) {
            hasMore = false;
            break;
          }
          
          // Process batch and write to response
          batch.forEach(order => {
            const row = [
              `"${(order.order_id || '').replace(/"/g, '""')}"`,
              `"${(order.business_name || '').replace(/"/g, '""')}"`,
              `"${(order.customer_name || '').replace(/"/g, '""')}"`,
              `"${(order.customer_phone || '').replace(/"/g, '""')}"`,
              `"${(order.address || '').replace(/"/g, '""')}"`,
              `"${(order.items || '').replace(/"/g, '""')}"`,
              `"${(order.status || '').replace(/"/g, '""')}"`,
              `"${(order.delivery_date ? (order.delivery_date instanceof Date ? order.delivery_date.toISOString() : order.delivery_date) : '').replace(/"/g, '""')}"`,
              `"${(order.notes || '').replace(/"/g, '""')}"`,
              `"${(order.created_at ? (order.created_at instanceof Date ? order.created_at.toISOString() : order.created_at) : '').replace(/"/g, '""')}"`
            ];
            res.write(row.join(',') + '\n');
          });
          
          offset += batchSize;
          
          // Allow garbage collection between batches
          if (global.gc) {
            global.gc();
          }
          
          // Small delay to prevent overwhelming the client
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        res.end();
        return;
      }
      
      // For non-streaming exports (JSON, PDF) or when streaming is disabled
      // Use a reasonable limit to prevent memory issues
      const maxLimit = 10000; // Higher limit for non-streaming
      const orders = await query.orderBy('o.created_at', 'desc').limit(maxLimit);
      
      if (orders.length === maxLimit) {
        logger.warn(`Export reached limit of ${maxLimit} orders. Consider using streaming for larger exports.`);
      }
      
      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="orders.json"');
        res.json(orders);
      } else if (format === 'pdf') {
        // Find business name if filtering by business
        let businessName = null;
        if (business_id) {
          const found = userBusinesses.find(b => b.business_id === business_id);
          if (found) businessName = found.business_name;
        }
        generateOrdersPDF(orders, res, businessName);
      } else {
        // CSV format (non-streaming)
        const csv = generateOrdersCSV(orders);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
        res.send(csv);
      }
    } catch (error) {
      logger.error('Export error:', error);
      res.status(500).json({ error: 'Failed to export orders: ' + error.message });
    }
  }
}; 