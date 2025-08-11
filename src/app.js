// src/app.js
const express = require('express');
const path = require('path');
const session = require('express-session');
const logger = require('./utils/logger');
const cacheService = require('./services/CacheService');
const memoryMonitor = require('./utils/memoryMonitor');
const sessionConfig = require('./config/session');
const { sessionDebug, sessionErrorHandler } = require('./middleware/session.middleware');
const BotServiceManager = require('./services/BotServiceManager');

// Handle memory-based restart requests gracefully (for web service)
process.on('restart-requested', (info) => {
  logger.error('Web service restart requested due to memory issue. Exiting process so Railway or PM2 can restart...');
  process.exit(1);
});

// Import routes
const adminRoutes = require('./routes/admin.routes');
const apiRoutes = require('./routes/api.routes');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const orderRoutes = require('./routes/order.routes');
const businessRoutes = require('./routes/business.routes');
const inventoryRoutes = require('./routes/inventory.routes');

const app = express();
const port = process.env.PORT || 3000;

// Basic middleware setup (must be before routes)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Add EJS helpers for currency formatting
app.locals.formatCurrency = function(amount) {
  if (amount === null || amount === undefined) return '₦0.00';
  return `₦${parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

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

// Initialize bot services
async function initializeBotServices() {
  try {
    // Check if we're in web-only mode (no bot services)
    // Use NODE_ENV to determine if this is a web-only deployment
    if (process.env.NODE_ENV === 'production' && !process.env.BOT_PORT) {
      logger.info('Running in production web-only mode - skipping bot service initialization');
      return true;
    }

    // Check if this is a Railway deployment with separate services
    if (process.env.RAILWAY_PUBLIC_DOMAIN && process.env.NODE_ENV === 'production') {
      logger.info('Railway deployment detected - bot services will be handled by separate service');
      return true;
    }

    // Check for WEB_ONLY environment variable for local development
    if (process.env.WEB_ONLY === 'true') {
      logger.info('WEB_ONLY mode detected - skipping bot service initialization');
      return true;
    }

    const botManager = BotServiceManager.getInstance();
    await botManager.initialize();
    logger.info('Bot services initialized successfully');
    return true;
  } catch (error) {
    logger.error('Failed to initialize bot services:', error);
    logger.warn('Continuing without bot services - web interface will have limited functionality');
    return false;
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
  
  // Inventory routes
  app.use('/inventory', inventoryRoutes);
  
  // Telegram webhook route
  app.post('/webhook/telegram', async (req, res) => {
    try {
      const update = req.body;
      
      // Get the bot manager instance
      const botManager = BotServiceManager.getInstance();
      const telegramService = botManager.getTelegramService();
      
      if (!telegramService) {
        logger.error('Telegram service not available for webhook');
        return res.status(500).json({ error: 'Telegram service not available' });
      }
      
      // Handle the webhook update
      if (update.message) {
        await telegramService.handleMessage(update.message);
      } else if (update.callback_query) {
        // Handle callback queries if needed
        logger.debug('Webhook callback query received:', update.callback_query);
      }
      
      res.status(200).json({ ok: true });
    } catch (error) {
      logger.error('Webhook error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  try {
    const botManager = BotServiceManager.getInstance();
    await botManager.shutdown();
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  try {
    const botManager = BotServiceManager.getInstance();
    await botManager.shutdown();
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
});

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

    // Initialize bot services
    const botServicesInitialized = await initializeBotServices();
    if (!botServicesInitialized) {
      console.error('Failed to initialize bot services');
      // Don't exit, continue without bot services
    }

    // Setup routes
    setupRoutes();

    // Start memory monitoring
    startMemoryMonitoring();

    // Start the server
    app.listen(port, () => {
      logger.info(`Server is running on port ${port}`);
      logger.info('SESSION_SECRET is set:', !!process.env.SESSION_SECRET);
      logger.info('NODE_ENV:', process.env.NODE_ENV);
      logger.info('RAILWAY_PUBLIC_DOMAIN:', process.env.RAILWAY_PUBLIC_DOMAIN);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

module.exports = { app, initializeApp }; 