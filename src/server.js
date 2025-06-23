// src/server.js
const express = require('express');
const path = require('path');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const redis = require('redis');
const logger = require('./utils/logger');
const RegistrationService = require('./services/RegistrationService');
const WhatsAppService = require('./services/WhatsAppService');
const AdminService = require('./services/AdminService');
const db = require('./config/database');
const OrderService = require('./services/OrderService');
const cacheService = require('./services/CacheService');
const memoryMonitor = require('./utils/memoryMonitor');

const app = express();
const port = process.env.PORT || 3000;

// Parse Redis URL for Railway
const redisUrl = process.env.REDIS_URL;
console.log('Redis URL:', redisUrl ? 'Set' : 'Not set');

// Basic middleware setup (must be before routes)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Set trust proxy for Railway or any proxy environment
app.set('trust proxy', 1);

// Initialize Redis and session middleware
async function initializeSession() {
  if (!redisUrl) {
    console.error('REDIS_URL is not set. Session storage will not work properly.');
    process.exit(1);
  }

  const redisClient = redis.createClient(redisUrl, {
    legacyMode: true,
    retry_strategy: function(options) {
      if (options.error && options.error.code === 'ECONNREFUSED') {
        return new Error('Redis connection refused');
      }
      if (options.total_retry_time > 1000 * 60 * 60) {
        return new Error('Redis retry time exhausted');
      }
      if (options.attempt > 10) {
        return new Error('Redis max retries reached');
      }
      return Math.min(options.attempt * 100, 3000);
    }
  });

  redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });

  redisClient.on('connect', () => {
    console.log('Redis client connected successfully');
  });

  redisClient.on('ready', () => {
    console.log('Redis client ready');
  });

  try {
    // Wait for Redis to be ready
    await new Promise((resolve, reject) => {
      redisClient.once('ready', resolve);
      redisClient.once('error', reject);
    });

    // Create Redis store instance
    const store = new RedisStore({ 
      client: redisClient,
      prefix: 'sess:',
      ttl: 86400, // 24 hours in seconds
      disableTouch: false, // Enable touch to extend session lifetime
      scanCount: 100, // Number of keys to scan per iteration
      serializer: {
        stringify: (data) => JSON.stringify(data),
        parse: (data) => JSON.parse(data)
      }
    });

    store.on('error', (err) => {
      console.error('Redis store error:', err);
    });

    // Configure session middleware
    const sessionConfig = {
      store: store,
      secret: process.env.SESSION_SECRET || 'your-secret-key',
      resave: true,
      saveUninitialized: true,
      rolling: true,
      name: 'sessionId',
      cookie: {
        // For debugging, always set secure: false
        secure: false,
        sameSite: 'lax',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/'
      }
    };

    app.use(session(sessionConfig));

    // Add session debugging middleware with more details
    app.use((req, res, next) => {
      if (req.path.startsWith('/admin')) {
        console.log('Session middleware - Path:', req.path);
        console.log('Session middleware - Session ID:', req.sessionID);
        console.log('Session middleware - Session data:', req.session);
        console.log('Session middleware - Cookie:', req.session.cookie);
      }
      next();
    });

    // Add session error handling middleware
    app.use((err, req, res, next) => {
      console.error('Session error:', err);
      if (err.code === 'ECONNREFUSED') {
        return res.status(500).render('error', { error: 'Session service unavailable' });
      }
      next(err);
    });

    return true;
  } catch (err) {
    console.error('Failed to initialize session:', err);
    return false;
  }
}

// Admin authentication middleware
const requireAdmin = async (req, res, next) => {
  console.log('requireAdmin middleware - Session:', req.session);
  console.log('requireAdmin middleware - Session ID:', req.sessionID);
  console.log('requireAdmin middleware - Session adminId:', req.session ? req.session.adminId : undefined);
  console.log('requireAdmin middleware - Session isAuthenticated:', req.session ? req.session.isAuthenticated : undefined);
  
  if (!req.session || !req.session.adminId || !req.session.isAuthenticated) {
    console.log('requireAdmin middleware - Authentication failed');
    return res.redirect('/admin/login');
  }
  
  try {
    const admin = await AdminService.getAdminById(req.session.adminId);
    console.log('requireAdmin middleware - Admin lookup result:', admin);
    
    if (!admin || !admin.is_active) {
      console.log('requireAdmin middleware - Admin not found or inactive');
      req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying session:', err);
        }
        res.redirect('/admin/login');
      });
      return;
    }
    
    req.admin = admin;
    next();
  } catch (error) {
    logger.error('Admin auth error:', error);
    res.redirect('/admin/login');
  }
};

// Health check endpoint
app.get('/health', async (req, res) => {
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
});

// Memory usage endpoint for monitoring
app.get('/memory', (req, res) => {
  try {
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
});

// Debug route to inspect session data and session ID
app.get('/admin/debug-session', async (req, res) => {
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
});

// Debug route to test session without authentication
app.get('/admin/test-session', (req, res) => {
  console.log('=== /admin/test-session route hit ===');
  console.log('Session ID:', req.sessionID);
  console.log('Session data:', req.session);
  res.json({
    message: 'Session test route hit',
    sessionId: req.sessionID,
    hasSession: !!req.session,
    hasAdminId: !!(req.session && req.session.adminId),
    hasIsAuthenticated: !!(req.session && req.session.isAuthenticated)
  });
});

// Start server
async function startServer() {
  try {
    // Initialize session middleware first
    const sessionInitialized = await initializeSession();
    if (!sessionInitialized) {
      console.error('Failed to initialize session middleware');
      process.exit(1);
    }

    // Initialize cache service
    const cacheInitialized = await cacheService.connect();
    if (cacheInitialized) {
      logger.info('Cache service initialized successfully');
    } else {
      logger.warn('Cache service initialization failed, continuing without caching');
    }

    // Define routes after session middleware is initialized
    // Public routes
    app.get('/', (req, res) => {
      res.render('index');
    });

    app.get('/register', (req, res) => {
      res.render('register');
    });

    app.post('/register', async (req, res) => {
      try {
        const { name, email, phoneNumber } = req.body;
        const user = await RegistrationService.registerUser(name, email, phoneNumber);
        res.redirect(`/setup-business?userId=${user.id}`);
      } catch (error) {
        logger.error('Registration error:', error);
        res.render('register', { error: 'Registration failed. Please try again.' });
      }
    });

    app.get('/setup-business', (req, res) => {
      const { userId } = req.query;
      res.render('setup-business', { userId });
    });

    app.post('/setup-business', async (req, res) => {
      try {
        const { userId, businessName } = req.body;
        const result = await RegistrationService.createBusiness(userId, businessName);
        
        // Check if we have a short code or need to use the business ID
        const setupCommand = result.setupIdentifier.includes('-') 
          ? `/setup ${result.setupIdentifier}` 
          : `/setup ${result.businessId}`;
        
        res.render('group-setup', { 
          userId,
          businessName,
          businessId: result.businessId,
          setupCommand
        });
      } catch (error) {
        logger.error('Business setup error:', error);
        res.render('setup-business', { 
          error: 'Setup failed. Please try again.',
          userId: req.body.userId
        });
      }
    });

    app.get('/dashboard', async (req, res) => {
      try {
        const { userId } = req.query;
        const [groups, businesses, orderStats, recentOrders] = await Promise.all([
          RegistrationService.getUserGroups(userId),
          RegistrationService.getUserBusinesses(userId),
          OrderService.getUserOrderStats(userId),
          OrderService.getUserRecentOrders(userId, 5)
        ]);
        res.render('dashboard', { groups, businesses, userId, orderStats, recentOrders });
      } catch (error) {
        logger.error('Dashboard error:', error);
        res.render('error', { error: 'Failed to load dashboard.' });
      }
    });

    // Add new business for existing users
    app.get('/add-business', (req, res) => {
      const { userId } = req.query;
      if (!userId) {
        return res.redirect('/register');
      }
      res.render('add-business', { userId });
    });

    app.post('/add-business', async (req, res) => {
      try {
        const { userId, businessName } = req.body;
        const result = await RegistrationService.addBusinessToUser(userId, businessName);
        res.redirect(`/dashboard?userId=${userId}`);
      } catch (error) {
        logger.error('Add business error:', error);
        res.render('add-business', { 
          error: 'Failed to add business. Please try again.',
          userId: req.body.userId
        });
      }
    });

    // Orders page for users
    app.get('/orders', async (req, res) => {
      try {
        const { userId, business, status, search, page = 1, pageSize = 25 } = req.query;
        
        // Get user's businesses for the filter dropdown
        const businesses = await RegistrationService.getUserBusinesses(userId);
        
        // Get all business IDs for the user
        const userBusinesses = await db.query('groups')
          .select('business_id')
          .where('user_id', userId)
          .groupBy('business_id');
        
        const businessIds = userBusinesses.map(b => b.business_id);
        
        if (businessIds.length === 0) {
          return res.render('orders', { 
            orders: [], 
            businesses: [], 
            userId,
            selectedBusiness: business,
            selectedStatus: status,
            search,
            page: parseInt(page),
            pageSize: parseInt(pageSize),
            totalPages: 0,
            totalOrders: 0
          });
        }

        // Build query based on filters
        let query = db.query('orders as o')
          .select(
            'o.*',
            'g.business_name'
          )
          .join('groups as g', 'o.business_id', 'g.business_id')
          .whereIn('o.business_id', businessIds);

        // Apply business filter
        if (business) {
          query = query.where('o.business_id', business);
        }

        // Apply status filter
        if (status) {
          query = query.where('o.status', status);
        }

        // Apply search filter
        if (search) {
          query = query.where(function() {
            this.where('o.customer_name', 'ilike', `%${search}%`)
              .orWhere('o.order_id', 'ilike', `%${search}%`);
          });
        }

        // Get total count for pagination
        const totalCount = await query.clone().count('o.id as count').first();
        const totalOrders = parseInt(totalCount.count);
        const totalPages = Math.ceil(totalOrders / parseInt(pageSize));
        const currentPage = Math.max(1, Math.min(parseInt(page), totalPages || 1));
        const offset = (currentPage - 1) * parseInt(pageSize);

        // Get orders with pagination
        const orders = await query
          .orderBy('o.created_at', 'desc')
          .limit(parseInt(pageSize))
          .offset(offset);

        res.render('orders', { 
          orders, 
          businesses, 
          userId,
          selectedBusiness: business,
          selectedStatus: status,
          search,
          page: currentPage,
          pageSize: parseInt(pageSize),
          totalPages,
          totalOrders
        });
      } catch (error) {
        logger.error('Orders page error:', error);
        res.render('error', { error: 'Failed to load orders.' });
      }
    });

    // Order management API endpoints
    app.get('/api/orders/:orderId', async (req, res) => {
      try {
        const { orderId } = req.params;
        const { userId } = req.query;
        
        // Input validation
        if (!orderId || !userId) {
          return res.status(400).json({ error: 'Order ID and User ID are required' });
        }
        
        // Validate orderId format (should be numeric)
        if (!/^\d+$/.test(orderId)) {
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
    });

    app.post('/api/orders/:orderId/status', async (req, res) => {
      try {
        const { orderId } = req.params;
        const { status, userId } = req.body;
        
        // Input validation
        if (!orderId || !status || !userId) {
          return res.status(400).json({ error: 'Order ID, status, and User ID are required' });
        }
        
        // Validate orderId format
        if (!/^\d+$/.test(orderId)) {
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
    });

    app.put('/api/orders/:orderId', async (req, res) => {
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
    });

    // Order count API endpoint for real-time updates
    app.get('/api/orders/count', async (req, res) => {
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
    });

    // Groups page route
    app.get('/groups', async (req, res) => {
      try {
        const userId = req.session.userId;
        if (!userId) {
          return res.redirect('/login');
        }

        // Get user's businesses
        const businesses = await db.query('groups')
          .select('business_id', 'business_name')
          .where('user_id', userId)
          .groupBy('business_id', 'business_name');

        // Get user's groups
        const groups = await db.query('groups')
          .where('user_id', userId)
          .orderBy('created_at', 'desc');

        res.render('groups', {
          userId,
          businesses,
          groups
        });
      } catch (error) {
        logger.error('Groups page error:', error);
        res.status(500).render('error', { error: 'Failed to load groups page' });
      }
    });

    // Groups API endpoints
    app.post('/api/groups', async (req, res) => {
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
    });

    app.get('/api/groups/:groupId', async (req, res) => {
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
    });

    app.delete('/api/groups/:groupId', async (req, res) => {
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
    });

    // Settings page route
    app.get('/settings', async (req, res) => {
      try {
        const userId = req.session.userId;
        if (!userId) {
          return res.redirect('/login');
        }

        // Get user data
        const user = await db.query('users')
          .where('id', userId)
          .first();

        if (!user) {
          return res.redirect('/login');
        }

        // Get user's businesses
        const businesses = await db.query('groups')
          .select('business_id', 'business_name', 'created_at')
          .where('user_id', userId)
          .groupBy('business_id', 'business_name', 'created_at');

        // Get user's groups
        const groups = await db.query('groups')
          .where('user_id', userId);

        // Get user's orders for business stats
        const orders = await db.query('orders as o')
          .select('o.*', 'g.business_id')
          .join('groups as g', 'o.business_id', 'g.business_id')
          .where('g.user_id', userId);

        res.render('settings', {
          userId,
          user,
          businesses,
          groups,
          orders
        });
      } catch (error) {
        logger.error('Settings page error:', error);
        res.status(500).render('error', { error: 'Failed to load settings page' });
      }
    });

    // Settings API endpoints
    app.put('/api/settings/profile', async (req, res) => {
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
    });

    app.put('/api/settings/password', async (req, res) => {
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
    });

    app.put('/api/settings/notifications', async (req, res) => {
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
    });

    // Admin routes
    app.get('/admin/login', (req, res) => {
      console.log('GET /admin/login - Session:', req.session);
      console.log('GET /admin/login - Session ID:', req.sessionID);
      if (req.session && req.session.adminId) {
        return res.redirect('/admin/dashboard');
      }
      res.render('admin/login');
    });

    app.post('/admin/login', async (req, res) => {
      try {
        const { username, password } = req.body;
        console.log('POST /admin/login - Attempting login for:', username);
        console.log('POST /admin/login - Session ID before login:', req.sessionID);
        console.log('POST /admin/login - Session data before login:', req.session);
        
        if (!username || !password) {
          return res.render('admin/login', { error: 'Username and password are required' });
        }
        
        const admin = await AdminService.authenticate(username, password);
        
        if (!admin) {
          console.log('POST /admin/login - Invalid credentials for:', username);
          return res.render('admin/login', { error: 'Invalid credentials' });
        }

        console.log('POST /admin/login - Login successful for:', username);

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

          console.log('Session saved successfully:', {
            sessionId: req.sessionID,
            adminId: req.session.adminId,
            admin: req.session.admin,
            isAuthenticated: req.session.isAuthenticated
          });

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
    });

    app.get('/admin/dashboard', requireAdmin, async (req, res) => {
      try {
        console.log('GET /admin/dashboard - Session ID:', req.sessionID);
        console.log('GET /admin/dashboard - Session data:', req.session);
        const [stats, businesses, orders] = await Promise.all([
          AdminService.getSystemStats(),
          AdminService.getActiveBusinesses(),
          AdminService.getRecentOrders()
        ]);

        res.render('admin/dashboard', {
          admin: req.admin,
          stats,
          businesses,
          orders
        });
      } catch (error) {
        logger.error('Admin dashboard error:', error);
        res.render('error', { error: 'Failed to load admin dashboard' });
      }
    });

    app.get('/admin/logout', (req, res) => {
      req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying session:', err);
        }
        res.redirect('/admin/login');
      });
    });

    app.get('/admin/orders', requireAdmin, async (req, res) => {
      try {
        const { status, business, search } = req.query;
        const orders = await AdminService.getAllOrdersWithDetails({ status, business, search });
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
    });

    app.post('/admin/orders/:orderId/complete', requireAdmin, async (req, res) => {
      try {
        await AdminService.markOrderCompleted(req.params.orderId);
        res.redirect('/admin/orders');
      } catch (error) {
        logger.error('Mark order completed error:', error);
        res.render('error', { error: 'Failed to update order.' });
      }
    });

    app.post('/admin/orders/:orderId/delete', requireAdmin, async (req, res) => {
      try {
        await AdminService.deleteOrder(req.params.orderId);
        res.redirect('/admin/orders');
      } catch (error) {
        logger.error('Delete order error:', error);
        res.render('error', { error: 'Failed to delete order.' });
      }
    });

    app.get('/admin/orders/:orderId/edit', requireAdmin, async (req, res) => {
      try {
        const order = await AdminService.getOrderById(req.params.orderId);
        res.render('admin/edit-order', { admin: req.admin, order });
      } catch (error) {
        logger.error('Get order for edit error:', error);
        res.render('error', { error: 'Failed to load order for editing.' });
      }
    });

    app.post('/admin/orders/:orderId/edit', requireAdmin, async (req, res) => {
      try {
        await AdminService.editOrder(req.params.orderId, req.body);
        res.redirect('/admin/orders');
      } catch (error) {
        logger.error('Edit order error:', error);
        res.render('error', { error: 'Failed to edit order.' });
      }
    });

    // Admin: Manage Businesses
    app.get('/admin/businesses', requireAdmin, async (req, res) => {
      console.log('=== /admin/businesses route hit ===');
      try {
        const businesses = await AdminService.getAllBusinessesWithOwners();
        res.render('admin/businesses', { admin: req.admin, businesses });
      } catch (error) {
        logger.error('Admin businesses error:', error);
        res.render('error', { error: 'Failed to load businesses.' });
      }
    });
    
    app.get('/admin/businesses/add', requireAdmin, (req, res) => {
      res.render('admin/edit-business', { admin: req.admin, business: null });
    });
    
    app.post('/admin/businesses/add', requireAdmin, async (req, res) => {
      try {
        await AdminService.addBusiness(req.body);
        res.redirect('/admin/businesses');
      } catch (error) {
        logger.error('Add business error:', error);
        res.render('error', { error: 'Failed to add business.' });
      }
    });
    
    app.get('/admin/businesses/:businessId/edit', requireAdmin, async (req, res) => {
      try {
        const business = await AdminService.getBusinessById(req.params.businessId);
        res.render('admin/edit-business', { admin: req.admin, business });
      } catch (error) {
        logger.error('Get business for edit error:', error);
        res.render('error', { error: 'Failed to load business for editing.' });
      }
    });
    
    app.post('/admin/businesses/:businessId/edit', requireAdmin, async (req, res) => {
      try {
        await AdminService.editBusiness(req.params.businessId, req.body);
        res.redirect('/admin/businesses');
      } catch (error) {
        logger.error('Edit business error:', error);
        res.render('error', { error: 'Failed to edit business.' });
      }
    });
    
    // Note: Groups table doesn't have is_active column, so toggle route is removed
    // app.post('/admin/businesses/:businessId/toggle', requireAdmin, async (req, res) => {
    //   try {
    //     await AdminService.toggleBusinessActive(req.params.businessId);
    //     res.redirect('/admin/businesses');
    //   } catch (error) {
    //     logger.error('Toggle business active error:', error);
    //     res.render('error', { error: 'Failed to update business status.' });
    //   }
    // });
    
    app.post('/admin/businesses/:businessId/delete', requireAdmin, async (req, res) => {
      try {
        await AdminService.deleteBusiness(req.params.businessId);
        res.redirect('/admin/businesses');
      } catch (error) {
        logger.error('Delete business error:', error);
        res.render('error', { error: 'Failed to delete business.' });
      }
    });
    
    // Admin: Manage Users
    app.get('/admin/users', requireAdmin, async (req, res) => {
      console.log('=== /admin/users route hit ===');
      try {
        const users = await AdminService.getAllUsers();
        const successMessage = req.session.successMessage;
        // Clear the success message from session after displaying
        delete req.session.successMessage;
        res.render('admin/users', { admin: req.admin, users, successMessage });
      } catch (error) {
        logger.error('Admin users error:', error);
        res.render('error', { error: 'Failed to load users.' });
      }
    });
    
    app.get('/admin/users/add', requireAdmin, (req, res) => {
      res.render('admin/edit-user', { admin: req.admin, user: null });
    });
    
    app.post('/admin/users/add', requireAdmin, async (req, res) => {
      try {
        await AdminService.addUser(req.body);
        res.redirect('/admin/users');
      } catch (error) {
        logger.error('Add user error:', error);
        res.render('error', { error: 'Failed to add user.' });
      }
    });
    
    app.get('/admin/users/:userId/edit', requireAdmin, async (req, res) => {
      try {
        const user = await AdminService.getUserById(req.params.userId);
        res.render('admin/edit-user', { admin: req.admin, user });
      } catch (error) {
        logger.error('Get user for edit error:', error);
        res.render('error', { error: 'Failed to load user for editing.' });
      }
    });
    
    app.post('/admin/users/:userId/edit', requireAdmin, async (req, res) => {
      try {
        await AdminService.editUser(req.params.userId, req.body);
        res.redirect('/admin/users');
      } catch (error) {
        logger.error('Edit user error:', error);
        res.render('error', { error: 'Failed to edit user.' });
      }
    });
    
    app.post('/admin/users/:userId/delete', requireAdmin, async (req, res) => {
      try {
        const result = await AdminService.deleteUser(req.params.userId);
        // Add success message to session for display
        req.session.successMessage = result.message;
        res.redirect('/admin/users');
      } catch (error) {
        logger.error('Delete user error:', error);
        // Display the specific error message from AdminService
        res.render('error', { error: error.message || 'Failed to delete user.' });
      }
    });

    // Admin: Manage Admins
    app.get('/admin/admins', requireAdmin, async (req, res) => {
      console.log('=== /admin/admins route hit ===');
      try {
        const admins = await AdminService.getAllAdmins();
        res.render('admin/admins', { admin: req.admin, admins });
      } catch (error) {
        logger.error('Admin admins error:', error);
        res.render('error', { error: 'Failed to load admins.' });
      }
    });
    
    app.get('/admin/admins/add', requireAdmin, (req, res) => {
      res.render('admin/edit-admin', { admin: req.admin, adminUser: null });
    });
    
    app.post('/admin/admins/add', requireAdmin, async (req, res) => {
      try {
        await AdminService.addAdmin(req.body);
        res.redirect('/admin/admins');
      } catch (error) {
        logger.error('Add admin error:', error);
        res.render('error', { error: 'Failed to add admin.' });
      }
    });
    
    app.get('/admin/admins/:adminId/edit', requireAdmin, async (req, res) => {
      try {
        const adminUser = await AdminService.getAdminById(req.params.adminId);
        res.render('admin/edit-admin', { admin: req.admin, adminUser });
      } catch (error) {
        logger.error('Get admin for edit error:', error);
        res.render('error', { error: 'Failed to load admin for editing.' });
      }
    });
    
    app.post('/admin/admins/:adminId/edit', requireAdmin, async (req, res) => {
      try {
        await AdminService.editAdmin(req.params.adminId, req.body);
        res.redirect('/admin/admins');
      } catch (error) {
        logger.error('Edit admin error:', error);
        res.render('error', { error: 'Failed to edit admin.' });
      }
    });
    
    app.post('/admin/admins/:adminId/toggle', requireAdmin, async (req, res) => {
      try {
        await AdminService.toggleAdminActive(req.params.adminId);
        res.redirect('/admin/admins');
      } catch (error) {
        logger.error('Toggle admin active error:', error);
        res.render('error', { error: 'Failed to update admin status.' });
      }
    });
    
    app.post('/admin/admins/:adminId/delete', requireAdmin, async (req, res) => {
      try {
        await AdminService.deleteAdmin(req.params.adminId);
        res.redirect('/admin/admins');
      } catch (error) {
        logger.error('Delete admin error:', error);
        res.render('error', { error: 'Failed to delete admin.' });
      }
    });

    // Business management routes
    app.get('/business/:businessId', async (req, res) => {
      try {
        const userId = req.session.userId;
        if (!userId) {
          return res.redirect('/login');
        }

        const { businessId } = req.params;

        // Get business details
        const business = await db.query('groups')
          .select('business_id', 'business_name', 'created_at')
          .where('business_id', businessId)
          .where('user_id', userId)
          .first();

        if (!business) {
          return res.status(404).render('error', { error: 'Business not found' });
        }

        // Get business groups
        const businessGroups = await db.query('groups')
          .where('business_id', businessId)
          .orderBy('created_at', 'desc');

        // Get business orders for stats
        const businessOrders = await db.query('orders')
          .where('business_id', businessId);

        // Calculate business stats
        const businessStats = {
          totalOrders: businessOrders.length,
          completedOrders: businessOrders.filter(o => o.status === 'delivered').length,
          pendingOrders: businessOrders.filter(o => o.status === 'pending').length
        };

        // Get recent orders
        const recentOrders = await db.query('orders')
          .where('business_id', businessId)
          .orderBy('created_at', 'desc')
          .limit(10);

        res.render('business', {
          userId,
          business,
          businessGroups,
          businessStats,
          recentOrders
        });
      } catch (error) {
        logger.error('Business page error:', error);
        res.status(500).render('error', { error: 'Failed to load business page' });
      }
    });

    app.get('/business/add', async (req, res) => {
      try {
        const userId = req.session.userId;
        if (!userId) {
          return res.redirect('/login');
        }

        res.render('business', {
          userId,
          business: null
        });
      } catch (error) {
        logger.error('Add business page error:', error);
        res.status(500).render('error', { error: 'Failed to load add business page' });
      }
    });

    // Business API endpoints
    app.post('/api/businesses', async (req, res) => {
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
    });

    app.put('/api/businesses/:businessId', async (req, res) => {
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
    });

    app.delete('/api/businesses/:businessId', async (req, res) => {
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
    });

    // Setup group route
    app.get('/setup-group', async (req, res) => {
      try {
        const userId = req.session.userId;
        if (!userId) {
          return res.redirect('/login');
        }

        const { businessId } = req.query;
        if (!businessId) {
          return res.redirect('/dashboard');
        }

        // Get business details
        const business = await db.query('groups')
          .select('business_id', 'business_name', 'setup_identifier')
          .where('business_id', businessId)
          .where('user_id', userId)
          .first();

        if (!business) {
          return res.status(404).render('error', { error: 'Business not found' });
        }

        // Get business groups
        const businessGroups = await db.query('groups')
          .where('business_id', businessId)
          .orderBy('created_at', 'desc');

        res.render('setup-group', {
          userId,
          business,
          businessGroups
        });
      } catch (error) {
        logger.error('Setup group page error:', error);
        res.status(500).render('error', { error: 'Failed to load setup group page' });
      }
    });

    // Export functionality
    app.get('/api/export/orders', async (req, res) => {
      try {
        const { userId, business_id, status, search, format = 'csv' } = req.query;
        
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
          return res.status(400).json({ error: 'No businesses found for this user' });
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

        const orders = await query.orderBy('o.created_at', 'desc');

        if (format === 'json') {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', 'attachment; filename="orders.json"');
          res.json(orders);
        } else {
          // CSV format
          const csv = generateOrdersCSV(orders);
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
          res.send(csv);
        }
      } catch (error) {
        logger.error('Export orders error:', error);
        res.status(500).json({ error: 'Failed to export orders' });
      }
    });

    // WhatsApp bot management endpoints
    app.get('/api/whatsapp/bot-info', async (req, res) => {
      try {
        // Import WhatsAppService
        const WhatsAppService = require('./services/WhatsAppService');
        const whatsappService = new WhatsAppService();
        
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
    });

    app.post('/api/whatsapp/change-number', async (req, res) => {
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
        const WhatsAppService = require('./services/WhatsAppService');
        const whatsappService = new WhatsAppService();

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
    });

    // Start memory monitoring in production
    if (process.env.NODE_ENV === 'production') {
      memoryMonitor.start();
      logger.info('Memory monitoring started');
    }

    // Start the server
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
      console.log('SESSION_SECRET is set:', !!process.env.SESSION_SECRET);
      console.log('NODE_ENV:', process.env.NODE_ENV);
      console.log('RAILWAY_PUBLIC_DOMAIN:', process.env.RAILWAY_PUBLIC_DOMAIN);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

module.exports = app;