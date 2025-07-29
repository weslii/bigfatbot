const AdminService = require('../services/AdminService');
const logger = require('../utils/logger');
const db = require('../config/database');
const { generateOrdersPDF, generateBusinessesPDF, generateBusinessesCSV, generateOrdersCSV } = require('../utils/exportHelpers');

// PRESERVE botStartTime FROM ORIGINAL SERVER.JS
const botStartTime = Date.now();

module.exports = {
  // Debug routes
  debugSession: async (req, res) => {
    let admin = null;
    if (req.session && req.session.adminId) {
      try {
        admin = await AdminService.getAdminById(req.session.adminId);
      } catch (e) {
        admin = { error: e.message };
      }
    }
    res.json({
      sessionId: req.sessionID,
      session: req.session,
      adminLookup: admin
    });
  },

  testSession: (req, res) => {
    // console.log('=== /admin/test-session route hit ===');
    // console.log('Session ID:', req.sessionID);
    // console.log('Session data:', req.session);
    res.json({
      message: 'Session test route hit',
      sessionId: req.sessionID,
      hasSession: !!req.session,
      hasAdminId: !!(req.session && req.session.adminId),
      hasIsAuthenticated: !!(req.session && req.session.isAuthenticated)
    });
  },

  // Authentication
  renderLogin: (req, res) => {
    // console.log('GET /admin/login - Session:', req.session);
    // console.log('GET /admin/login - Session ID:', req.sessionID);
    if (req.session && req.session.adminId) {
      return res.redirect('/admin/dashboard');
    }
    res.render('admin/login');
  },

  handleLogin: async (req, res) => {
    try {
      const { username, password } = req.body;
      // console.log('POST /admin/login - Attempting login for:', username);
      // console.log('POST /admin/login - Session ID before login:', req.sessionID);
      // console.log('POST /admin/login - Session data before login:', req.session);
      
      if (!username || !password) {
        return res.render('admin/login', { error: 'Username and password are required' });
      }
      
      const admin = await AdminService.authenticate(username, password);
      
      if (!admin) {
        // console.log('POST /admin/login - Invalid credentials for:', username);
        return res.render('admin/login', { error: 'Invalid credentials' });
      }

      // console.log('POST /admin/login - Login successful for:', username);

      // Set session data directly before save
      req.session.adminId = admin.id;
      req.session.admin = {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      };
      req.session.isAuthenticated = true;

      // Force session save
      req.session.save((err) => {
        if (err) {
          console.error('Error saving session:', err);
          return res.render('admin/login', { error: 'Login failed' });
        }

        // console.log('Session saved successfully:', {
        //   sessionId: req.sessionID,
        //   adminId: req.session.adminId,
        //   admin: req.session.admin,
        //   isAuthenticated: req.session.isAuthenticated
        // });

        // Verify session was saved
        if (!req.session.adminId) {
          console.error('Session verification failed - adminId not set');
          return res.render('admin/login', { error: 'Login failed' });
        }

        res.redirect('/admin/dashboard');
      });
    } catch (error) {
      logger.error('Admin login error:', error);
      res.render('admin/login', { error: 'Login failed' });
    }
  },

  handleLogout: (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err);
      }
      res.redirect('/admin/login');
    });
  },

  // Dashboard
  renderDashboard: async (req, res) => {
    try {
      // console.log('GET /admin/dashboard - Session ID:', req.sessionID);
      // console.log('GET /admin/dashboard - Session data:', req.session);
      
      // Get real analytics data
      const analytics = await AdminService.getAnalytics();
      // console.log('Analytics data:', analytics);
      
      // Check if there are any bot metrics in the database
      const botMetrics = await db.query('bot_metrics').orderBy('created_at', 'desc').first();
      // console.log('Bot metrics from database:', botMetrics);
      
      // Get recent activity
      const recentActivity = await AdminService.getRecentActivity(5);
      // console.log('Recent activity:', recentActivity);
      
      // Calculate uptime based on bot start time
      const now = Date.now();
      const uptimeMs = now - botStartTime;
      const uptimeHours = uptimeMs / (1000 * 60 * 60);
      
      const stats = {
          totalRevenue: '45,231.89', // Keep static as requested
          totalBusinesses: analytics.totalBusinesses,
          totalOrders: analytics.totalOrders,
          botUptime: '100.0', // Always 100% since last restart
          botUptimeHours: uptimeHours.toFixed(2),
          businessChange: analytics.businessChange,
          orderChange: analytics.orderChange,
          connectionStatus: analytics.status || 'disconnected',
          phoneNumber: analytics.number || 'Not connected',
          lastActivity: analytics.lastActivity || new Date().toISOString(),
          messageSuccessRate: analytics.messageSuccessRate || 100,
          avgResponseTime: analytics.avgResponseTime || 0,
          dailyMessages: analytics.dailyMessages || 0
      };
      
      // console.log('Stats being passed to template:', stats);
      
      res.render('admin/preview-dashboard', {
        admin: req.admin,
        stats,
        recentActivity
      });
    } catch (error) {
      logger.error('Admin dashboard error:', error);
      // Fallback to mock data if real data fails
      res.render('admin/preview-dashboard', {
        admin: req.admin,
        stats: { totalRevenue: '45,231.89', totalBusinesses: 0, totalOrders: 0, botUptime: '100.0' },
        recentActivity: []
      });
    }
  },

  renderPreviewDashboard: async (req, res) => {
    try {
      // Get real analytics data
      const analytics = await AdminService.getAnalytics();
      // console.log('Analytics data:', analytics);
      
      // Check if there are any bot metrics in the database
      const botMetrics = await db.query('bot_metrics').orderBy('created_at', 'desc').first();
      // console.log('Bot metrics from database:', botMetrics);
      
      // Get recent activity
      const recentActivity = await AdminService.getRecentActivity(5);
      // console.log('Recent activity:', recentActivity);
      
      // Calculate uptime
      const now = Date.now();
      const uptimeMs = now - botStartTime;
      const uptimeHours = uptimeMs / (1000 * 60 * 60);
      res.render('admin/preview-dashboard', {
        admin: req.admin,
        stats: {
          totalRevenue: '45,231.89', // Keep static as requested
          totalBusinesses: analytics.totalBusinesses,
          totalOrders: analytics.totalOrders,
          botUptime: '100.0',
          botUptimeHours: uptimeHours.toFixed(2),
          businessChange: analytics.businessChange,
          orderChange: analytics.orderChange,
          connectionStatus: analytics.status || 'disconnected',
          phoneNumber: analytics.number || 'Not connected',
          lastActivity: analytics.lastActivity || new Date().toISOString(),
          messageSuccessRate: analytics.messageSuccessRate || 100,
          avgResponseTime: analytics.avgResponseTime || 0,
          dailyMessages: analytics.dailyMessages || 0
        }
      });
    } catch (error) {
      logger.error('Preview dashboard error:', error);
      // Fallback to mock data if real data fails
      res.render('admin/preview-dashboard', {
        admin: req.admin,
        stats: { totalRevenue: '45,231.89', totalBusinesses: 0, totalOrders: 0, botUptime: '100.0' }
      });
    }
  },

  // Orders Management
  listOrders: async (req, res) => {
    try {
      const { status, business, search } = req.query;
      const { orders, total } = await AdminService.getAllOrdersWithDetails({ status, business, search, limit: 1000, offset: 0 });
      // Get all businesses for the filter dropdown
      const businesses = await AdminService.getActiveBusinesses();
      res.render('admin/orders', {
        admin: req.admin,
        orders,
        filter: { status, business, search },
        businesses
      });
    } catch (error) {
      logger.error('Admin orders error:', error);
      res.render('error', { error: 'Failed to load orders.' });
    }
  },

  completeOrder: async (req, res) => {
    try {
      await AdminService.markOrderCompleted(req.params.orderId);
      res.redirect('/admin/orders');
    } catch (error) {
      logger.error('Mark order completed error:', error);
      res.render('error', { error: 'Failed to update order.' });
    }
  },

  deleteOrder: async (req, res) => {
    try {
      await AdminService.deleteOrder(req.params.orderId);
      res.redirect('/admin/orders');
    } catch (error) {
      logger.error('Delete order error:', error);
      res.render('error', { error: 'Failed to delete order.' });
    }
  },

  renderEditOrder: async (req, res) => {
    try {
      const order = await AdminService.getOrderById(req.params.orderId);
      res.render('admin/edit-order', { admin: req.admin, order });
    } catch (error) {
      logger.error('Get order for edit error:', error);
      res.render('error', { error: 'Failed to load order for editing.' });
    }
  },

  handleEditOrder: async (req, res) => {
    try {
      await AdminService.editOrder(req.params.orderId, req.body);
      res.redirect('/admin/orders');
    } catch (error) {
      logger.error('Edit order error:', error);
      res.render('error', { error: 'Failed to edit order.' });
    }
  },

  // Business Management
  listBusinesses: async (req, res) => {
    // console.log('=== /admin/businesses route hit ===');
    try {
      const { business_name = '', owner = '', status = '' } = req.query;
      const { businesses } = await AdminService.getAllBusinessesWithOwners(1000, 0, '', business_name, owner, status);
      const filter = { business_name, owner, status };
      // Get all unique business names
      const allBusinesses = await db.query('groups').distinct('business_name');
      // Get all unique owner names and emails
      const ownersRaw = await db.query('groups as g')
        .leftJoin('users as u', 'g.user_id', 'u.id')
        .distinct('u.full_name', 'u.email');
      const allOwners = ownersRaw
        .map(o => o.full_name)
        .filter(Boolean)
        .concat(ownersRaw.map(o => o.email).filter(Boolean))
        .filter((v, i, a) => a.indexOf(v) === i);
      res.render('admin/businesses', { admin: req.admin, businesses, filter, allBusinesses, allOwners });
    } catch (error) {
      logger.error('Admin businesses error:', error);
      res.render('error', { error: 'Failed to load businesses.' });
    }
  },

  renderAddBusiness: (req, res) => {
    res.render('admin/edit-business', { admin: req.admin, business: null });
  },

  handleAddBusiness: async (req, res) => {
    try {
      await AdminService.addBusiness(req.body);
      res.redirect('/admin/businesses');
    } catch (error) {
      logger.error('Add business error:', error);
      res.render('error', { error: 'Failed to add business.' });
    }
  },

  renderEditBusiness: async (req, res) => {
    try {
      const business = await AdminService.getBusinessById(req.params.businessId);
      res.render('admin/edit-business', { admin: req.admin, business });
    } catch (error) {
      logger.error('Get business for edit error:', error);
      res.render('error', { error: 'Failed to load business for editing.' });
    }
  },

  handleEditBusiness: async (req, res) => {
    try {
      await AdminService.editBusiness(req.params.businessId, req.body);
      res.redirect('/admin/businesses');
    } catch (error) {
      logger.error('Edit business error:', error);
      res.render('error', { error: 'Failed to edit business.' });
    }
  },

  toggleBusinessActive: async (req, res) => {
    try {
      await AdminService.toggleBusinessActive(req.params.businessId);
      res.json({ success: true });
    } catch (error) {
      logger.error('Toggle business active error:', error);
      res.status(500).json({ error: 'Failed to toggle business status.' });
    }
  },

  deleteBusiness: async (req, res) => {
    try {
      await AdminService.deleteBusiness(req.params.businessId);
      res.redirect('/admin/businesses');
    } catch (error) {
      logger.error('Delete business error:', error);
      res.render('error', { error: 'Failed to delete business.' });
    }
  },

  // User Management
  listUsers: async (req, res) => {
    // console.log('=== /admin/users route hit ===');
    try {
      const { name = '', email = '', phone = '' } = req.query;
      const users = await AdminService.getAllUsersWithFilters(name, email, phone);
      const filter = { name, email, phone };
      // Get all unique names, emails, phones
      const allNames = (await db.query('users').distinct('full_name')).map(u => u.full_name).filter(Boolean);
      const allEmails = (await db.query('users').distinct('email')).map(u => u.email).filter(Boolean);
      const allPhones = (await db.query('users').distinct('phone_number')).map(u => u.phone_number).filter(Boolean);
      const successMessage = req.session.successMessage;
      delete req.session.successMessage;
      res.render('admin/users', { admin: req.admin, users, filter, allNames, allEmails, allPhones, successMessage });
    } catch (error) {
      logger.error('Admin users error:', error);
      res.render('error', { error: 'Failed to load users.' });
    }
  },

  renderAddUser: (req, res) => {
    res.render('admin/edit-user', { admin: req.admin, user: null });
  },

  handleAddUser: async (req, res) => {
    try {
      await AdminService.addUser(req.body);
      res.redirect('/admin/users');
    } catch (error) {
      logger.error('Add user error:', error);
      res.render('error', { error: 'Failed to add user.' });
    }
  },

  renderEditUser: async (req, res) => {
    try {
      const user = await AdminService.getUserById(req.params.userId);
      res.render('admin/edit-user', { admin: req.admin, user });
    } catch (error) {
      logger.error('Get user for edit error:', error);
      res.render('error', { error: 'Failed to load user for editing.' });
    }
  },

  handleEditUser: async (req, res) => {
    try {
      await AdminService.editUser(req.params.userId, req.body);
      res.redirect('/admin/users');
    } catch (error) {
      logger.error('Edit user error:', error);
      res.render('error', { error: 'Failed to edit user.' });
    }
  },

  deleteUser: async (req, res) => {
    try {
      const result = await AdminService.deleteUser(req.params.userId);
      // Add success message to session for display
      req.session.successMessage = result.message;
      res.redirect('/admin/users');
    } catch (error) {
      logger.error('Delete user error:', error);
      req.session.errorMessage = error.message;
      res.redirect('/admin/users');
    }
  },

  toggleUserActive: async (req, res) => {
    try {
      const result = await AdminService.toggleUserActive(req.params.userId);
      res.json(result);
    } catch (error) {
      logger.error('Toggle user active error:', error);
      res.status(500).json({ error: 'Failed to toggle user status.' });
    }
  },

  // Admin Management
  listAdmins: async (req, res) => {
    // console.log('=== /admin/admins route hit ===');
    try {
      const admins = await AdminService.getAllAdmins();
      res.render('admin/admins', { admin: req.admin, admins });
    } catch (error) {
      logger.error('Admin admins error:', error);
      res.render('error', { error: 'Failed to load admins.' });
    }
  },

  renderAddAdmin: (req, res) => {
    res.render('admin/edit-admin', { admin: req.admin, adminUser: null });
  },

  handleAddAdmin: async (req, res) => {
    try {
      await AdminService.addAdmin(req.body);
      res.redirect('/admin/admins');
    } catch (error) {
      logger.error('Add admin error:', error);
      res.render('error', { error: 'Failed to add admin.' });
    }
  },

  renderEditAdmin: async (req, res) => {
    try {
      const adminUser = await AdminService.getAdminById(req.params.adminId);
      res.render('admin/edit-admin', { admin: req.admin, adminUser });
    } catch (error) {
      logger.error('Get admin for edit error:', error);
      res.render('error', { error: 'Failed to load admin for editing.' });
    }
  },

  handleEditAdmin: async (req, res) => {
    try {
      await AdminService.editAdmin(req.params.adminId, req.body);
      res.redirect('/admin/admins');
    } catch (error) {
      logger.error('Edit admin error:', error);
      res.render('error', { error: 'Failed to edit admin.' });
    }
  },

  toggleAdminActive: async (req, res) => {
    try {
      await AdminService.toggleAdminActive(req.params.adminId);
      res.redirect('/admin/admins');
    } catch (error) {
      logger.error('Toggle admin active error:', error);
      res.render('error', { error: 'Failed to update admin status.' });
    }
  },

  deleteAdmin: async (req, res) => {
    try {
      await AdminService.deleteAdmin(req.params.adminId);
      res.redirect('/admin/admins');
    } catch (error) {
      logger.error('Delete admin error:', error);
      res.render('error', { error: 'Failed to delete admin.' });
    }
  },

  // Reports
  renderReports: (req, res) => {
    res.render('admin/reports', { admin: req.admin });
  },

  getReportStats: async (req, res) => {
    try {
      const { startDate, endDate, businessId, userId, platform } = req.query;
      const stats = await AdminService.getReportStats({ startDate, endDate, businessId, userId, platform });
      res.json({ success: true, stats });
    } catch (error) {
      logger.error('Reports API error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch report stats.' });
    }
  },

  getParsingTimeSeries: async (req, res) => {
    try {
      const days = parseInt(req.query.days) || 14;
      const data = await AdminService.getParsingSuccessTimeSeries(days);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Parsing time-series API error:', error);
      res.status(500).json({ success: false, data: [] });
    }
  },

  // API endpoints
  getApiBusinesses: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.pageSize) || 10;
      const offset = (page - 1) * pageSize;

      // Get total count of unique businesses
      const [{ count }] = await db.query('groups').countDistinct('business_id as count');

      // Get paginated businesses with status and owner info
      const businesses = await db.query('groups as g')
        .select(
          'g.business_id', 
          'g.business_name',
          db.query.raw('MAX(g.is_active::int) = 1 as is_active'),
          db.query.raw('MIN(u.full_name) as owner_name'),
          db.query.raw('MIN(u.email) as owner_email'),
          db.query.raw('COUNT(DISTINCT o.id) as order_count')
        )
        .leftJoin('users as u', 'g.user_id', 'u.id')
        .leftJoin('orders as o', 'g.business_id', 'o.business_id')
        .groupBy('g.business_id', 'g.business_name')
        .orderBy('g.business_name')
        .limit(pageSize)
        .offset(offset);

      res.json({ businesses, total: parseInt(count) });
    } catch (error) {
      logger.error('API businesses error:', error);
      res.status(500).json({ businesses: [], total: 0 });
    }
  },

  getApiOrders: async (req, res) => {
    try {
      let { page = 1, pageSize = 10, status, business, search, date_from, date_to } = req.query;
      page = parseInt(page, 10) || 1;
      pageSize = parseInt(pageSize, 10) || 10;
      const offset = (page - 1) * pageSize;

      let query = db.query('orders as o')
        .join('groups as g', 'o.business_id', 'g.business_id')
        .select('o.*', 'g.business_name');

      if (status) query = query.where('o.status', status);
      if (business) query = query.where('o.business_id', business);
      if (search) {
        query = query.where(function() {
          this.where('o.customer_name', 'like', `%${search}%`)
            .orWhere('o.order_id', 'like', `%${search}%`);
        });
      }
      if (date_from) query = query.where('o.created_at', '>=', date_from);
      if (date_to) query = query.where('o.created_at', '<=', date_to + ' 23:59:59');

      // Count query (no joins, just filters)
      let countQuery = db.query('orders as o');
      if (status) countQuery = countQuery.where('o.status', status);
      if (business) countQuery = countQuery.where('o.business_id', business);
      if (search) {
        countQuery = countQuery.where(function() {
          this.where('o.customer_name', 'like', `%${search}%`)
            .orWhere('o.order_id', 'like', `%${search}%`);
        });
      }
      if (date_from) countQuery = countQuery.where('o.created_at', '>=', date_from);
      if (date_to) countQuery = countQuery.where('o.created_at', '<=', date_to + ' 23:59:59');
      const totalOrdersResult = await countQuery.countDistinct('o.id as count').first();
      const totalOrders = parseInt(totalOrdersResult.count) || 0;
      const totalPages = Math.ceil(totalOrders / pageSize) || 1;

      const orders = await query
        .distinct('o.id')
        .orderBy('o.created_at', 'desc')
        .limit(pageSize)
        .offset(offset);

      res.json({
        success: true,
        orders,
        page,
        totalPages,
        totalOrders
      });
    } catch (error) {
      logger.error('Admin API orders error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch orders' });
    }
  },

  getApiOrderDetails: async (req, res) => {
    try {
      const order = await AdminService.getOrderById(req.params.orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json(order);
    } catch (error) {
      logger.error('API order details error:', error);
      res.status(500).json({ error: 'Failed to load order details.' });
    }
  },

  getApiAnalytics: async (req, res) => {
    try {
      const analytics = await AdminService.getAnalytics();
      // Calculate uptime (100% since last start)
      const now = Date.now();
      const uptimeMs = now - botStartTime;
      const uptimeHours = uptimeMs / (1000 * 60 * 60);
      // For now, always 100% since last start
      analytics.botUptime = '100.0';
      analytics.botUptimeHours = uptimeHours.toFixed(2);
      res.json(analytics);
    } catch (error) {
      logger.error('Analytics API error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  },

  getApiUsers: async (req, res) => {
    try {
      const users = await db.query('users')
        .select('id', 'full_name', 'email')
        .orderBy('full_name');
      res.json({ users });
    } catch (error) {
      logger.error('API users error:', error);
      res.status(500).json({ users: [] });
    }
  },

  // Export functionality
  exportBusinesses: async (req, res) => {
    try {
      const { format = 'csv', search, status } = req.query;
      
      // Build query for businesses
      let query = db.query('groups as g')
        .select(
          'g.business_id', 
          'g.business_name',
          db.query.raw('MAX(g.is_active::int) = 1 as is_active'),
          db.query.raw('MIN(u.full_name) as owner_name'),
          db.query.raw('MIN(u.email) as owner_email'),
          db.query.raw('COUNT(DISTINCT o.id) as total_orders'),
          db.query.raw('MIN(g.created_at) as created_at')
        )
        .leftJoin('users as u', 'g.user_id', 'u.id')
        .leftJoin('orders as o', 'g.business_id', 'o.business_id')
        .groupBy('g.business_id', 'g.business_name');
      
      // Apply filters
      if (search) {
        query = query.where(function() {
          this.where('g.business_name', 'like', `%${search}%`)
            .orWhere('u.full_name', 'like', `%${search}%`)
            .orWhere('u.email', 'like', `%${search}%`);
        });
      }
      if (status) {
        if (status === 'active') {
          query = query.having(db.query.raw('MAX(g.is_active::int) = 1'));
        } else if (status === 'inactive') {
          query = query.having(db.query.raw('MAX(g.is_active::int) = 0'));
        }
      }
      
      const businesses = await query.orderBy('g.business_name');
      
      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="businesses.json"');
        res.json(businesses);
      } else if (format === 'pdf') {
        generateBusinessesPDF(businesses, res);
      } else {
        // CSV format
        const csv = generateBusinessesCSV(businesses);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="businesses.csv"');
        res.send(csv);
      }
    } catch (error) {
      logger.error('Businesses export error:', error);
      res.status(500).json({ error: 'Failed to export businesses: ' + error.message });
    }
  },

  exportOrders: async (req, res) => {
    try {
      const { format = 'csv', status, business, search, streaming = 'true' } = req.query;
      
      // Build query for orders with business details
      let query = db.query('orders as o')
        .join('groups as g', 'o.business_id', 'g.business_id')
        .select(
          'o.*',
          'g.business_name'
        );
      
      // Apply filters
      if (status) {
        query = query.where('o.status', status);
      }
      if (business) {
        query = query.where('o.business_id', business);
      }
      if (search) {
        query = query.where(function() {
          this.where('o.customer_name', 'like', `%${search}%`)
            .orWhere('o.order_id', 'like', `%${search}%`)
            .orWhere('g.business_name', 'like', `%${search}%`);
        });
      }

      // For streaming exports (CSV), use pagination
      if (format === 'csv' && streaming === 'true') {
        // Stream CSV directly to response
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="admin-orders.csv"');
        
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
        logger.warn(`Admin export reached limit of ${maxLimit} orders. Consider using streaming for larger exports.`);
      }

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="orders.json"');
        res.json(orders);
      } else if (format === 'pdf') {
        generateOrdersPDF(orders, res);
      } else {
        // CSV format
        const csv = generateOrdersCSV(orders);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
        res.send(csv);
      }
    } catch (error) {
      logger.error('Admin orders export error:', error);
      res.status(500).json({ error: 'Failed to export orders: ' + error.message });
    }
  },

  renderBusinessDetails: async (req, res) => {
    try {
      const business = await AdminService.getBusinessById(req.params.businessId);
      if (!business) {
        return res.status(404).render('error', { error: 'Business not found.' });
      }
      // Get additional business details like groups, orders, etc.
      const groups = await db.query('groups').where('business_id', req.params.businessId).orderBy('platform', 'asc');
      const orders = await db.query('orders').where('business_id', req.params.businessId).orderBy('created_at', 'desc').limit(10);
      const totalOrdersResult = await db.query('orders').where('business_id', req.params.businessId).count('* as count').first();
      const totalOrders = totalOrdersResult ? totalOrdersResult.count : 0;
      res.render('admin/business-details', {
        admin: req.admin,
        business,
        groups,
        orders,
        totalOrders
      });
    } catch (error) {
      logger.error('Get business details error:', error);
      res.render('error', { error: 'Failed to load business details.' });
    }
  }
}; 