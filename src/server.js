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

    // Configure session middleware
    const sessionConfig = {
      store: new RedisStore({ 
        client: redisClient,
        prefix: 'sess:',
        ttl: 86400, // 24 hours in seconds
        disableTouch: false, // Enable touch to extend session lifetime
        scanCount: 100, // Number of keys to scan per iteration
        serializer: {
          stringify: (data) => JSON.stringify(data),
          parse: (data) => JSON.parse(data)
        }
      }),
      secret: process.env.SESSION_SECRET || 'your-secret-key',
      resave: true,
      saveUninitialized: true,
      rolling: true,
      name: 'sessionId',
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/'
      }
    };

    // Add Redis store error handling
    const store = new RedisStore({ 
      client: redisClient,
      prefix: 'sess:',
      ttl: 86400,
      disableTouch: false,
      scanCount: 100,
      serializer: {
        stringify: (data) => JSON.stringify(data),
        parse: (data) => JSON.parse(data)
      }
    });

    store.on('error', (err) => {
      console.error('Redis store error:', err);
    });

    app.use(session(sessionConfig));

    // Add session debugging middleware with more details
    app.use((req, res, next) => {
      if (req.path.startsWith('/admin')) {
        console.log('Session middleware - Path:', req.path);
        console.log('Session middleware - Session ID:', req.sessionID);
        console.log('Session middleware - Session data:', req.session);
        console.log('Session middleware - Cookie:', req.session.cookie);
        console.log('Session middleware - Store:', store);
      }
      next();
    });

    return true;
  } catch (err) {
    console.error('Failed to initialize session:', err);
    return false;
  }
}

// Admin authentication middleware
const requireAdmin = async (req, res, next) => {
  if (!req.session || !req.session.adminId) {
    return res.redirect('/admin/login');
  }
  
  try {
    const admin = await AdminService.getAdminById(req.session.adminId);
    
    if (!admin || !admin.is_active) {
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
        const groups = await RegistrationService.getUserGroups(userId);
        res.render('dashboard', { groups });
      } catch (error) {
        logger.error('Dashboard error:', error);
        res.render('error', { error: 'Failed to load dashboard.' });
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
        
        if (!username || !password) {
          return res.render('admin/login', { error: 'Username and password are required' });
        }
        
        const admin = await AdminService.authenticate(username, password);
        
        if (!admin) {
          console.log('POST /admin/login - Invalid credentials for:', username);
          return res.render('admin/login', { error: 'Invalid credentials' });
        }

        console.log('POST /admin/login - Login successful for:', username);

        // Set session data directly
        req.session.adminId = admin.id;
        req.session.admin = {
          id: admin.id,
          username: admin.username,
          email: admin.email,
          role: admin.role
        };

        // Force session save with callback
        req.session.save((err) => {
          if (err) {
            console.error('Error saving session:', err);
            return res.render('admin/login', { error: 'Login failed' });
          }
          console.log('Session saved successfully:', req.session);
          console.log('Session ID after save:', req.sessionID);
          
          // Verify session was saved
          store.get(req.sessionID, (err, session) => {
            if (err) {
              console.error('Error verifying session:', err);
            } else {
              console.log('Verified session in store:', session);
            }
            res.redirect('/admin/dashboard');
          });
        });
      } catch (error) {
        logger.error('Admin login error:', error);
        res.render('admin/login', { error: 'Login failed' });
      }
    });

    app.get('/admin/dashboard', requireAdmin, async (req, res) => {
      try {
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