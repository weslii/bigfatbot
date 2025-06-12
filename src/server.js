// src/server.js
const express = require('express');
const path = require('path');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');
const logger = require('./utils/logger');
const RegistrationService = require('./services/RegistrationService');
const WhatsAppService = require('./services/WhatsAppService');
const AdminService = require('./services/AdminService');
const db = require('./config/database');

const app = express();
const port = process.env.PORT || 3000;

// Create Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Debug Redis connection
console.log('Redis URL:', process.env.REDIS_URL ? 'Set' : 'Not set');

let redisStore;
let isRedisConnected = false;

// Initialize Redis connection
const initRedis = async () => {
  try {
    await redisClient.connect();
    console.log('Redis client connected');
    isRedisConnected = true;
    
    // Create Redis store after successful connection
    redisStore = new RedisStore({ client: redisClient });
    console.log('Redis store initialized');
    
    // Update session config with Redis store
    sessionConfig.store = redisStore;
    console.log('Session config updated with Redis store');
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
    isRedisConnected = false;
  }
};

redisClient.on('error', (err) => {
  console.error('Redis client error:', err);
  isRedisConnected = false;
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Debug session secret
console.log('SESSION_SECRET is set:', !!process.env.SESSION_SECRET);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('RAILWAY_PUBLIC_DOMAIN:', process.env.RAILWAY_PUBLIC_DOMAIN);

// Session configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
};

// Initialize Redis and then set up session middleware
initRedis().then(() => {
  // Debug session store
  console.log('Session config:', JSON.stringify(sessionConfig, null, 2));
  app.use(session(sessionConfig));
  
  // Set view engine
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  
  // Start server after Redis is initialized
  app.listen(port, () => {
    logger.info(`Dashboard server running on port ${port}`);
  });
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await db.raw('SELECT 1');
    
    const status = {
      status: 'ok',
      redis: isRedisConnected ? 'connected' : 'disconnected',
      database: 'connected'
    };
    res.status(200).json(status);
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      status: 'error',
      redis: isRedisConnected ? 'connected' : 'disconnected',
      database: 'disconnected',
      error: error.message
    });
  }
});

// Admin authentication middleware
const requireAdmin = async (req, res, next) => {
  console.log('requireAdmin middleware: session =', req.session);
  console.log('Session store type:', req.sessionStore.constructor.name);
  logger.debug('requireAdmin middleware: session adminId =', req.session.adminId);
  if (!req.session.adminId) {
    logger.debug('No adminId in session, redirecting to login');
    return res.redirect('/admin/login');
  }
  try {
    const admin = await AdminService.getAdminById(req.session.adminId);
    logger.debug('requireAdmin middleware: admin =', admin);
    if (!admin || !admin.is_active) {
      logger.debug('Admin not found or not active, destroying session and redirecting to login');
      req.session.destroy();
      return res.redirect('/admin/login');
    }
    req.admin = admin;
    next();
  } catch (error) {
    logger.error('Admin auth error:', error);
    res.redirect('/admin/login');
  }
};

// Admin routes
app.get('/admin/login', (req, res) => {
  res.render('admin/login');
});

app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
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

module.exports = app; 