// src/app.js
const express = require('express');
const path = require('path');
const session = require('express-session');
const logger = require('./utils/logger');
const cacheService = require('./services/CacheService');
const memoryMonitor = require('./utils/memoryMonitor');
const sessionConfig = require('./config/session');
const { sessionDebug, sessionErrorHandler } = require('./middleware/session.middleware');

// Import routes
const adminRoutes = require('./routes/admin.routes');
const apiRoutes = require('./routes/api.routes');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const orderRoutes = require('./routes/order.routes');
const businessRoutes = require('./routes/business.routes');

const app = express();
const port = process.env.PORT || 3000;

// Basic middleware setup (must be before routes)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Set trust proxy for Railway or any proxy environment
app.set('trust proxy', 1);

// Initialize session middleware
async function initializeSession() {
  try {
    const { store, config } = await sessionConfig();
    
    app.use(session(config));
    
    // Add session debugging middleware
    app.use(sessionDebug);
    
    // Add session error handling middleware
    app.use(sessionErrorHandler);
    
    return true;
  } catch (err) {
    console.error('Failed to initialize session:', err);
    return false;
  }
}

// Initialize cache service
async function initializeCache() {
  const cacheInitialized = await cacheService.connect();
  if (cacheInitialized) {
    logger.info('Cache service initialized successfully');
  } else {
    logger.warn('Cache service initialization failed, continuing without caching');
  }
}

// Start memory monitoring in production
function startMemoryMonitoring() {
  if (process.env.NODE_ENV === 'production') {
    memoryMonitor.start();
    logger.info('Memory monitoring started');
  }
}

// Setup routes
function setupRoutes() {
  // Admin routes
  app.use('/admin', adminRoutes);
  
  // API routes
  app.use('/api', apiRoutes);
  
  // Auth routes
  app.use('/', authRoutes);
  
  // User routes
  app.use('/', userRoutes);
  
  // Order routes
  app.use('/', orderRoutes);
  
  // Business routes
  app.use('/', businessRoutes);
}

// Initialize app
async function initializeApp() {
  try {
    // Initialize session middleware first
    const sessionInitialized = await initializeSession();
    if (!sessionInitialized) {
      console.error('Failed to initialize session middleware');
      process.exit(1);
    }

    // Initialize cache service
    await initializeCache();

    // Setup routes
    setupRoutes();

    // Start memory monitoring
    startMemoryMonitoring();

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

module.exports = { app, initializeApp }; 