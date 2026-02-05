const logger = require('../utils/logger');
const db = require('../config/database');
const { generateOrdersCSV, generateOrdersPDF } = require('../utils/exportHelpers');

module.exports = {
  // Orders page for users
  renderOrders: async (req, res) => {
    try {
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      if (!userId) {
        return res.redirect('/login');
      }

      const { business, status, search, submittedBy, startDate = '', endDate = '', page = 1, pageSize = 10 } = req.query;

      // Get user's business IDs first to avoid duplicates
      const userBusinesses = await db.query('groups')
        .select('business_id', 'business_name')
        .where('user_id', userId)
        .groupBy('business_id', 'business_name');
      
      const businessIds = userBusinesses.map(b => b.business_id);

      let query = db.query('orders as o')
        .whereIn('o.business_id', businessIds)
        .select('o.*', db.query.raw('(SELECT business_name FROM groups WHERE business_id = o.business_id AND user_id = ? LIMIT 1) as business_name', [userId]));

      if (business) {
        query.where('o.business_id', business);
      }
      if (status) {
        query.where('o.status', status);
      }
      if (submittedBy) {
        query.where('o.submitted_by', submittedBy);
      }
      if (search) {
        query.where(function() {
          this.where('o.customer_name', 'ilike', `%${search}%`)
            .orWhere('o.order_id', 'ilike', `%${search}%`);
        });
      }
      
      // Date filtering
      if (startDate) {
        const startDateTime = new Date(startDate);
        startDateTime.setHours(0, 0, 0, 0);
        query.where('o.created_at', '>=', startDateTime);
      }
      
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        query.where('o.created_at', '<=', endDateTime);
      }

      const totalCountResult = await query.clone().clearSelect().count('o.id as count').first();
      const totalOrders = parseInt(totalCountResult.count, 10);
      const totalPages = Math.ceil(totalOrders / pageSize);

      const orders = await query.clone()
        .orderBy('o.created_at', 'desc')
        .limit(pageSize)
        .offset((page - 1) * pageSize);
        
      const businesses = userBusinesses;

      // Distinct submitters for filter dropdown (user's orders only)
      const submitters = await db.query('orders as o')
        .select('o.submitted_by')
        .whereIn('o.business_id', businessIds)
        .whereNotNull('o.submitted_by')
        .where('o.submitted_by', '!=', '')
        .groupBy('o.submitted_by')
        .orderBy('o.submitted_by', 'asc');

      // Chart Data - Use the same approach to avoid duplicates
      const baseChartQuery = db.query('orders as o')
        .whereIn('o.business_id', businessIds);
      
      const statusCounts = await baseChartQuery.clone()
        .groupBy('o.status')
        .select('o.status', db.query.raw('count(DISTINCT o.id) as count'));
      
      const ordersByBusiness = await db.query('orders as o')
        .select(
          db.query.raw('(SELECT business_name FROM groups WHERE business_id = o.business_id AND user_id = ? LIMIT 1) as business_name', [userId]),
          db.query.raw('count(DISTINCT o.id) as count')
        )
        .whereIn('o.business_id', businessIds)
        .groupBy('o.business_id');
      
      // Always return a 7-day range for trends
      const today = new Date();
      today.setHours(0,0,0,0);
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 6);
      const trendRaw = await baseChartQuery.clone()
        .where('o.created_at', '>=', sevenDaysAgo)
        .groupByRaw('date(o.created_at)')
        .orderByRaw('date(o.created_at)')
        .select(db.query.raw('date(o.created_at) as date'), db.query.raw('count(DISTINCT o.id) as count'));
      // Fill in missing days with 0
      const trendMap = {};
      trendRaw.forEach(row => { trendMap[row.date.toISOString().slice(0,10)] = Number(row.count); });
      const recentTrends = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(sevenDaysAgo);
        d.setDate(sevenDaysAgo.getDate() + i);
        const key = d.toISOString().slice(0,10);
        recentTrends.push({ date: key, count: trendMap[key] || 0 });
      }

      res.render('orders', {
        title: 'Orders Management',
        orders,
        businesses,
        submitters,
        totalOrders,
        totalPages,
        page: parseInt(page, 10),
        pageSize: parseInt(pageSize, 10),
        selectedBusiness: business,
        selectedStatus: status,
        selectedSubmittedBy: submittedBy,
        search,
        startDate,
        endDate,
        userId,
        query: req.query,
        chartData: {
          statusCounts,
          ordersByBusiness,
          recentTrends
        }
      });
    } catch (error) {
      logger.error('Orders page error:', error);
      res.status(500).render('error', { error: 'Failed to load orders page. ' + error.message });
    }
  },

  // Export functionality with streaming for large datasets
  exportOrders: async (req, res) => {
    try {
      const { userId, business_id, status, search, submittedBy, format = 'csv', streaming = 'true' } = req.query;
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
      if (submittedBy) {
        query = query.where('o.submitted_by', submittedBy);
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
          'Submitted by',
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
              `"${(order.submitted_by || '').replace(/"/g, '""')}"`,
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