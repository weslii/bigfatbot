// src/server.js
const express = require('express');
const path = require('path');
const session = require('express-session');
const logger = require('./utils/logger');
const RegistrationService = require('./services/RegistrationService');
const WhatsAppService = require('./services/WhatsAppService');
const AdminService = require('./services/AdminService');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Admin authentication middleware
const requireAdmin = async (req, res, next) => {
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

    req.session.adminId = admin.id;
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

// Start server
app.listen(port, () => {
  logger.info(`Dashboard server running on port ${port}`);
});

module.exports = app; 