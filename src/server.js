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
const PDFDocument = require('pdfkit');
const { generateOrdersCSV, generateOrdersPDF, generateBusinessesCSV, generateBusinessesPDF } = require('./utils/exportHelpers');

const app = express();
const port = process.env.PORT || 3000;

// Parse Redis URL for Railway
const redisUrl = process.env.REDIS_URL;
console.log('Redis URL:', redisUrl ? 'Set' : 'Not set');

// Basic middleware setup (must be before routes)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

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
        // console.log('Session middleware - Path:', req.path);
        // console.log('Session middleware - Session ID:', req.sessionID);
        // console.log('Session middleware - Session data:', req.session);
        // console.log('Session middleware - Cookie:', req.session.cookie);
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
  // console.log('requireAdmin middleware - Session:', req.session);
  // console.log('requireAdmin middleware - Session ID:', req.sessionID);
  // console.log('requireAdmin middleware - Session adminId:', req.session ? req.session.adminId : undefined);
  // console.log('requireAdmin middleware - Session isAuthenticated:', req.session ? req.session.isAuthenticated : undefined);
  
  if (!req.session || !req.session.adminId || !req.session.isAuthenticated) {
    // console.log('requireAdmin middleware - Authentication failed');
    return res.redirect('/admin/login');
  }
  
  try {
    const admin = await AdminService.getAdminById(req.session.adminId);
    // console.log('requireAdmin middleware - Admin lookup result:', admin);
    
    if (!admin || !admin.is_active) {
      // console.log('requireAdmin middleware - Admin not found or inactive');
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

// Superadmin authentication middleware
const requireSuperAdmin = async (req, res, next) => {
  if (!req.session || !req.session.adminId || !req.session.isAuthenticated) {
    return res.status(403).json({ error: 'Superadmin access required' });
  }
  try {
    const admin = await AdminService.getAdminById(req.session.adminId);
    if (!admin || !admin.is_active || admin.role !== 'super_admin') {
      return res.status(403).json({ error: 'Superadmin access required' });
    }
    req.admin = admin;
    next();
  } catch (error) {
    logger.error('Superadmin auth error:', error);
    res.status(403).json({ error: 'Superadmin access required' });
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
});

// Update landing page to pass userId from session
app.get('/', (req, res) => {
  res.render('preview-landing');
});

// Add preview landing page route
app.get('/landing-preview', (req, res) => {
  res.render('landing-preview');
});

// Preview landing page route
app.get('/preview-landing', (req, res) => {
  res.render('preview-landing');
});

// Preview admin dashboard route
app.get('/admin/preview-dashboard', requireAdmin, async (req, res) => {
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
});

// Track bot start time
const botStartTime = Date.now();

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
      res.render('preview-landing');
    });

    app.get('/register', (req, res) => {
      res.render('register');
    });

    app.post('/register', async (req, res) => {
      try {
        const { name, email, phoneNumber, password } = req.body;
        const user = await RegistrationService.registerUser(name, email, phoneNumber, password);
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

    // Add user login routes
    app.get('/login', (req, res) => {
      if (req.session && req.session.userId) {
        return res.redirect(`/dashboard?userId=${req.session.userId}`);
      }
      res.render('login');
    });

    app.post('/login', async (req, res) => {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.render('login', { error: 'Email and password are required' });
      }
      try {
        // Find user by email
        const user = await db.query('users').where('email', email).first();
        if (!user) {
          return res.render('login', { error: 'Invalid email or password' });
        }
        
        // Check password (assume password is stored as hash, if not, compare plain text)
        const bcrypt = require('bcryptjs');
        const isValid = user.password_hash
          ? await bcrypt.compare(password, user.password_hash)
          : password === user.password;
        if (!isValid) {
          return res.render('login', { error: 'Invalid email or password' });
        }
        if (!req.session) {
          logger.error('Session is undefined during login');
          return res.render('login', { error: 'Session error. Please try again or contact support.' });
        }
        
        // Ensure userId is a string
        const userIdString = String(user.id);
        req.session.userId = userIdString;
        
        req.session.save((err) => {
          if (err) {
            logger.error('Error saving session:', err);
            return res.render('login', { error: 'Login failed. Please try again.' });
          }
          
          res.redirect(`/dashboard?userId=${userIdString}`);
        });
      } catch (error) {
        logger.error('User login error:', error);
        res.render('login', { error: 'Login failed. Please try again.' });
      }
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
          business: {
            business_id: result.businessId,
            setup_identifier: result.setupIdentifier
          },
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
        const userId = req.session && req.session.userId ? String(req.session.userId) : null;
        
        if (!userId) {
          return res.redirect('/login');
        }

        // Check if user is active
        const user = await db.query('users').where('id', userId).select('is_active').first();
        if (!user || !user.is_active) {
          req.session.destroy();
          return res.render('error', { error: 'Your account has been deactivated. Please contact support.' });
        }

        // Updated query to get businesses with order counts
        const businessesWithOrders = await db.query('groups as g')
          .select(
            'g.business_id', 
            'g.business_name', 
            db.query.raw('MIN(g.created_at) as created_at'),
            db.query.raw('MAX(g.is_active::int) as is_active'),
            db.query.raw('COUNT(DISTINCT o.id) as order_count')
          )
          .leftJoin('orders as o', 'g.business_id', 'o.business_id')
          .where('g.user_id', userId)
          .groupBy('g.business_id', 'g.business_name');
        
        const [groups, orderStats, recentOrders] = await Promise.all([
          RegistrationService.getUserGroups(userId),
          OrderService.getUserOrderStats(userId),
          OrderService.getUserRecentOrders(userId, 5)
        ]);
        
        res.render('dashboard', { 
          groups, 
          businesses: businessesWithOrders,
          userId, 
          orderStats, 
          recentOrders 
        });
      } catch (error) {
        logger.error('Dashboard error:', error);
        res.render('error', { error: 'Failed to load dashboard.' });
      }
    });

    // Add new business for existing users
    app.get('/add-business', (req, res) => {
      const userId = req.session && req.session.userId ? String(req.session.userId) : req.query.userId;
      if (!userId) {
        return res.redirect('/register');
      }
      res.render('add-business', { userId });
    });

    app.post('/add-business', async (req, res) => {
      try {
        const userId = req.session && req.session.userId ? String(req.session.userId) : null;
        const { businessName } = req.body;
        logger.info('Add business for userId:', userId);
        if (!userId) {
          return res.redirect('/login');
        }
        const result = await RegistrationService.addBusinessToUser(userId, businessName);
        // Redirect to group setup page for the new business
        res.redirect(`/setup-group?businessId=${result.businessId}&userId=${userId}`);
      } catch (error) {
        logger.error('Add business error:', error);
        res.render('add-business', { 
          error: 'Failed to add business. Please try again.',
          userId: req.session && req.session.userId ? String(req.session.userId) : null
        });
      }
    });

    // Orders page for users
    app.get('/orders', async (req, res) => {
      try {
        const userId = req.session && req.session.userId ? String(req.session.userId) : null;
        if (!userId) {
          return res.redirect('/login');
        }

        const { business, status, search, startDate = '', endDate = '', page = 1, pageSize = 10 } = req.query;

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
          totalOrders,
          totalPages,
          page: parseInt(page, 10),
          pageSize: parseInt(pageSize, 10),
          selectedBusiness: business,
          selectedStatus: status,
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
    });

    app.post('/api/orders/:orderId/status', async (req, res) => {
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
    });

    // Delete order endpoint
    app.delete('/api/orders/:orderId', async (req, res) => {
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
        const userId = req.session ? req.session.userId : null;
        if (!userId) {
          return res.redirect('/login');
        }

        // Get user's businesses
        const businesses = await db.query('groups')
          .select('business_id', 'business_name', 'setup_identifier')
          .where('user_id', userId)
          .groupBy('business_id', 'business_name', 'setup_identifier');

        // Get user's groups
        const groups = await db.query('groups')
          .where('user_id', userId)
          .whereNot('group_type', 'main')
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
        const userId = req.session ? req.session.userId : null;
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
      // console.log('GET /admin/login - Session:', req.session);
      // console.log('GET /admin/login - Session ID:', req.sessionID);
      if (req.session && req.session.adminId) {
        return res.redirect('/admin/dashboard');
      }
      res.render('admin/login');
    });

    app.post('/admin/login', async (req, res) => {
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
    });

    app.get('/admin/dashboard', requireAdmin, async (req, res) => {
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
    
    // Toggle business active status
    app.post('/admin/api/businesses/:businessId/toggle', requireAdmin, async (req, res) => {
      try {
        await AdminService.toggleBusinessActive(req.params.businessId);
        res.json({ success: true });
      } catch (error) {
        logger.error('Toggle business active error:', error);
        res.status(500).json({ error: 'Failed to toggle business status.' });
      }
    });
    
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
        req.session.errorMessage = error.message;
        res.redirect('/admin/users');
      }
    });

    // Toggle user active status
    app.post('/admin/api/users/:userId/toggle', requireAdmin, async (req, res) => {
      try {
        const result = await AdminService.toggleUserActive(req.params.userId);
        res.json(result);
      } catch (error) {
        logger.error('Toggle user active error:', error);
        res.status(500).json({ error: 'Failed to toggle user status.' });
      }
    });

    // Admin: Manage Admins
    app.get('/admin/admins', requireAdmin, async (req, res) => {
      // console.log('=== /admin/admins route hit ===');
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
        const userId = req.session ? req.session.userId : null;
        if (!userId) {
          return res.redirect('/login');
        }

        const { businessId } = req.params;

        // Get business details with all necessary fields
        const business = await db.query('groups')
          .select('business_id', 'business_name', 'created_at', 'setup_identifier')
          .where('business_id', businessId)
          .where('user_id', userId)
          .first();

        if (!business) {
          return res.status(404).render('error', { error: 'Business not found' });
        }

        // Get business groups
        const businessGroups = await db.query('groups')
          .select('id', 'group_name', 'group_id', 'group_type', 'created_at')
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
          .select('id', 'order_id', 'customer_name', 'items', 'status', 'created_at')
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
        const userId = req.session ? req.session.userId : null;
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
        const userId = req.session ? req.session.userId : null;
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
          .select('id', 'group_name', 'group_id', 'group_type', 'created_at')
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

    

    // Export functionality with streaming for large datasets
    app.get('/api/export/orders', async (req, res) => {
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
    });

    // Admin businesses export functionality
    app.get('/admin/api/export/businesses', requireAdmin, async (req, res) => {
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
    });

    // Admin orders export functionality with streaming
    app.get('/admin/api/export/orders', requireAdmin, async (req, res) => {
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
    });

    // WhatsApp bot management endpoints
    app.get('/api/whatsapp/bot-info', async (req, res) => {
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
    });

    // WhatsApp bot restart endpoint (admin required)
    app.post('/api/whatsapp/restart', requireAdmin, async (req, res) => {
      try {
        const { userId } = req.body;
        // Keep userId validation if present, but do not require admin session
        if (!userId) {
          return res.status(400).json({ error: 'User ID is required' });
        }
        // Import WhatsAppService
        const whatsappService = WhatsAppService.getInstance();
        // Call the restart method
        const authStatus = await whatsappService.restart();
        
        res.json({ 
          success: authStatus.success, 
          authenticated: authStatus.authenticated,
          message: authStatus.message,
          needsQrCode: authStatus.needsQrCode || false,
          phoneNumber: authStatus.phoneNumber
        });
      } catch (error) {
        logger.error('Restart WhatsApp bot error:', error);
        res.status(500).json({ 
          success: false,
          authenticated: false,
          message: 'Failed to restart WhatsApp bot',
          needsQrCode: true
        });
      }
    });

    // WhatsApp QR code API endpoint (superadmin only)
    app.get('/api/whatsapp/qr', requireSuperAdmin, async (req, res) => {
      try {
        const whatsappService = WhatsAppService.getInstance();
        const qrStatus = whatsappService.getLatestQrStatus();
        res.json(qrStatus);
      } catch (error) {
        logger.error('Get WhatsApp QR code error:', error);
        res.status(500).json({ error: 'Failed to get WhatsApp QR code' });
      }
    });

    // Start memory monitoring in production
    if (process.env.NODE_ENV === 'production') {
      memoryMonitor.start();
      logger.info('Memory monitoring started');
    }

    // Paginated API for businesses
    app.get('/admin/api/businesses', requireAdmin, async (req, res) => {
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
    });

    // Paginated API for orders
    app.get('/admin/api/orders', requireAdmin, async (req, res) => {
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
    });

    // Individual order details API
    app.get('/admin/api/orders/:orderId', requireAdmin, async (req, res) => {
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
    });

    // Analytics API endpoint
    app.get('/admin/api/analytics', requireAdmin, async (req, res) => {
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
    });

    // Admin: Reports page (placeholder)
    app.get('/admin/reports', requireAdmin, (req, res) => {
      res.render('admin/reports', { admin: req.admin });
    });

    // Admin: Reports API endpoint for summary stats
    app.get('/admin/api/reports', requireAdmin, async (req, res) => {
      try {
        const { startDate, endDate, businessId, userId } = req.query;
        const stats = await AdminService.getReportStats({ startDate, endDate, businessId, userId });
        res.json({ success: true, stats });
      } catch (error) {
        logger.error('Reports API error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch report stats.' });
      }
    });

    // API: All users for dropdown
    app.get('/admin/api/users', requireAdmin, async (req, res) => {
      try {
        const users = await db.query('users')
          .select('id', 'full_name', 'email')
          .orderBy('full_name');
        res.json({ users });
      } catch (error) {
        logger.error('API users error:', error);
        res.status(500).json({ users: [] });
      }
    });

    // API: Parsing success time-series for chart
    app.get('/admin/api/reports/parsing-time-series', requireAdmin, async (req, res) => {
      try {
        const days = parseInt(req.query.days) || 14;
        const data = await AdminService.getParsingSuccessTimeSeries(days);
        res.json({ success: true, data });
      } catch (error) {
        logger.error('Parsing time-series API error:', error);
        res.status(500).json({ success: false, data: [] });
      }
    });

    // Add user logout route
    app.post('/logout', (req, res) => {
      if (req.session) {
        req.session.destroy(() => {
          res.redirect('/login');
        });
      } else {
        res.redirect('/login');
      }
    });

    // Start the server
    app.listen(port, () => {
      // console.log(`Server is running on port ${port}`);
      // console.log('SESSION_SECRET is set:', !!process.env.SESSION_SECRET);
      // console.log('NODE_ENV:', process.env.NODE_ENV);
      // console.log('RAILWAY_PUBLIC_DOMAIN:', process.env.RAILWAY_PUBLIC_DOMAIN);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();