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
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - Body parsing middleware check`);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - After body parsing, req.body:`, req.body);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

(async () => {
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

  // Wait for Redis to be ready before setting up session
  await new Promise((resolve, reject) => {
    redisClient.once('ready', resolve);
    redisClient.once('error', reject);
  });

  try {
    // In legacy mode, we don't need to call connect()
    const sessionConfig = {
      store: new RedisStore({ 
        client: redisClient,
        prefix: 'sess:',
        ttl: 86400, // 24 hours in seconds
        disableTouch: false,
        serializer: {
          stringify: (data) => JSON.stringify(data),
          parse: (data) => JSON.parse(data)
        }
      }),
      secret: process.env.SESSION_SECRET || 'your-secret-key',
      resave: true,
      saveUninitialized: true,
      rolling: true,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      }
    };

    app.use(session(sessionConfig));
    console.log('Using Redis store for sessions');
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
    console.error('Redis connection details:', {
      url: redisUrl,
      nodeEnv: process.env.NODE_ENV,
      railwayEnv: process.env.RAILWAY_ENVIRONMENT
    });
    process.exit(1);
  }

  console.log('SESSION_SECRET is set:', !!process.env.SESSION_SECRET);
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('RAILWAY_PUBLIC_DOMAIN:', process.env.RAILWAY_PUBLIC_DOMAIN);

  // Admin authentication middleware
  const requireAdmin = async (req, res, next) => {
    console.log('requireAdmin middleware: session =', req.session);
    console.log('Session store type:', req.sessionStore.constructor.name);
    logger.debug('requireAdmin middleware: session adminId =', req.session.adminId);
    
    if (!req.session || !req.session.adminId) {
      logger.debug('No adminId in session, redirecting to login');
      return res.redirect('/admin/login');
    }
    
    try {
      const admin = await AdminService.getAdminById(req.session.adminId);
      logger.debug('requireAdmin middleware: admin =', admin);
      
      if (!admin || !admin.is_active) {
        logger.debug('Admin not found or not active, destroying session and redirecting to login');
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
      // Check database connection
      await db.raw('SELECT 1');
      
      const status = {
        status: 'ok',
        redis: 'connected',
        database: 'connected'
      };
      res.status(200).json(status);
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

  // Admin routes
  app.get('/admin/login', (req, res) => {
    if (req.session && req.session.adminId) {
      return res.redirect('/admin/dashboard');
    }
    res.render('admin/login');
  });

  // Add a test route to verify middleware is working
  app.post('/admin/test', (req, res) => {
    console.log('Test route - req.body:', req.body);
    res.json({ body: req.body, success: true });
  });

  app.post('/admin/login', async (req, res) => {
    try {
      // Debug logging
      console.log('Content-Type:', req.get('Content-Type'));
      console.log('req.body:', req.body);
      console.log('req.body type:', typeof req.body);
      
      // Check if req.body exists and has the required properties
      if (!req.body || typeof req.body !== 'object') {
        logger.error('req.body is not an object:', req.body);
        return res.render('admin/login', { error: 'Invalid request format' });
      }
      
      const { username, password } = req.body;
      
      // Additional validation
      if (!username || !password) {
        logger.error('Missing username or password:', { username: !!username, password: !!password });
        return res.render('admin/login', { error: 'Username and password are required' });
      }
      
      logger.debug('POST /admin/login: username =', username, 'password =', password);
      const admin = await AdminService.authenticate(username, password);
      logger.debug('POST /admin/login: admin =', admin);
      
      if (!admin) {
        return res.render('admin/login', { error: 'Invalid credentials' });
      }

      // Set session data
      req.session.adminId = admin.id;
      console.log('Session after login:', req.session);
      
      // Force session save
      req.session.save((err) => {
        if (err) {
          console.error('Error saving session:', err);
          return res.render('admin/login', { error: 'Login failed' });
        }
        console.log('Session saved successfully');
        console.log('Session store type:', req.sessionStore.constructor.name);
        res.redirect('/admin/dashboard');
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
    req.session.destroy();
    res.redirect('/admin/login');
  });

  // Routes
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
      
      // Store user ID in session or pass it to the next page
      res.redirect(`/setup-business?userId=${user.user_id}`);
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
      
      // Generate a unique business ID
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

  // Start server after all middleware and routes are set up
  app.listen(port, () => {
    logger.info(`Dashboard server running on port ${port}`);
  });
})();

module.exports = app;