// src/server.js
const express = require('express');
const path = require('path');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const logger = require('./utils/logger');
const RegistrationService = require('./services/RegistrationService');
const WhatsAppService = require('./services/WhatsAppService');
const AdminService = require('./services/AdminService');
const { database, redisClient } = require('./config/database');

const app = express();
const port = process.env.PORT || 3000;

// Set up view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Add body parser middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Configure session middleware
const sessionConfig = {
  store: new RedisStore({ 
    client: redisClient,
    prefix: 'sess:',
    ttl: 86400 // 24 hours in seconds
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  name: 'sessionId', // Explicitly set the cookie name
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/'
  }
};

app.use(session(sessionConfig));

// Add session debugging middleware
app.use((req, res, next) => {
  // Only log session info for admin routes
  if (req.path.startsWith('/admin')) {
    console.log('Session middleware - Path:', req.path);
    console.log('Session middleware - Session ID:', req.sessionID);
    console.log('Session middleware - Session data:', req.session);
  }
  next();
});

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

// Admin routes
app.get('/admin/login', (req, res) => {
  if (req.session && req.session.adminId) {
    return res.redirect('/admin/dashboard');
  }
  res.render('admin/login');
});

app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.render('admin/login', { error: 'Username and password are required' });
    }
    
    const admin = await AdminService.authenticate(username, password);
    
    if (!admin) {
      return res.render('admin/login', { error: 'Invalid credentials' });
    }

    // Set session data
    req.session.adminId = admin.id;
    
    // Force session save and wait for it to complete
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('Error saving session:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });

    // Verify session was saved
    if (!req.session.adminId) {
      throw new Error('Session not saved properly');
    }

    res.redirect('/admin/dashboard');
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

module.exports = app;