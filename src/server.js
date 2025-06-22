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
        const businessId = await RegistrationService.createBusiness(userId, businessName);
        res.render('group-setup', { 
          userId,
          businessName,
          businessId,
          setupCommand: `/setup ${businessId}`
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
        const [groups, businesses] = await Promise.all([
          RegistrationService.getUserGroups(userId),
          RegistrationService.getUserBusinesses(userId)
        ]);
        res.render('dashboard', { groups, businesses, userId });
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
        const businessId = await RegistrationService.addBusinessToUser(userId, businessName);
        res.redirect(`/dashboard?userId=${userId}`);
      } catch (error) {
        logger.error('Add business error:', error);
        res.render('add-business', { 
          error: 'Failed to add business. Please try again.',
          userId: req.body.userId
        });
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
        res.render('admin/users', { admin: req.admin, users });
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
        await AdminService.deleteUser(req.params.userId);
        res.redirect('/admin/users');
      } catch (error) {
        logger.error('Delete user error:', error);
        res.render('error', { error: 'Failed to delete user.' });
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