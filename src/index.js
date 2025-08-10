// src/index.js
// Load environment variables first (only works locally with .env file)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');
const memoryMonitor = require('./utils/memoryMonitor');

// Handle memory-based restart requests gracefully
process.on('restart-requested', (info) => {
  logger.error('Restart requested due to memory issue. Exiting process so Railway or PM2 can restart...');
  // Optionally: perform any cleanup here
  process.exit(1);
});

// Debug environment variables before loading database config
console.log('🔍 Environment Debug:');
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('POSTGRES_HOST exists:', !!process.env.POSTGRES_HOST);
console.log('TELEGRAM_BOT_TOKEN exists:', !!process.env.TELEGRAM_BOT_TOKEN);
console.log('TELEGRAM_BOT_USERNAME exists:', !!process.env.TELEGRAM_BOT_USERNAME);

// Now load database after environment check
const database = require('./config/database');
const BotServiceManager = require('./services/BotServiceManager');
const SchedulerService = require('./services/SchedulerService');
const HealthCheckService = require('./services/HealthCheckService');

// --- Health check endpoint for Railway worker ---
const express = require('express');
const healthApp = express();
const isProduction = process.env.NODE_ENV === 'production';

// Determine the correct port for the bot service
let HEALTH_PORT;
if (isProduction) {
  // In production, prefer BOT_PORT, fallback to PORT+1, then 3001
  HEALTH_PORT = process.env.BOT_PORT || (process.env.PORT ? parseInt(process.env.PORT) + 1 : 3001);
} else {
  // In development, use BOT_PORT or 3001
  HEALTH_PORT = process.env.BOT_PORT || 3001;
}

console.log(`🔧 Bot service will use port: ${HEALTH_PORT}`);
console.log(`🔧 Environment: ${process.env.NODE_ENV}`);
console.log(`🔧 BOT_PORT: ${process.env.BOT_PORT}`);
console.log(`🔧 PORT: ${process.env.PORT}`);

healthApp.get('/health', (req, res) => {
  console.log('🔧 Bot service health check accessed');
  console.log('🔧 Request headers:', req.headers);
  console.log('🔧 Request method:', req.method);
  console.log('🔧 Request path:', req.path);
  console.log('🔧 User agent:', req.headers['user-agent']);
  console.log('🔧 Host:', req.headers.host);
  
  // Simple health check that always works
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'bot',
    environment: process.env.NODE_ENV || 'development',
    port: HEALTH_PORT,
    uptime: process.uptime(),
    message: 'Bot service is running'
  });
});

// Additional health check for Railway
healthApp.get('/', (req, res) => {
  console.log('🔧 Bot service root endpoint accessed');
  res.status(200).json({
    status: 'ok',
    service: 'bot',
    message: 'BigFatBot Bot Service is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Simple startup health check
healthApp.get('/startup', (req, res) => {
  console.log('🔧 Bot service startup health check accessed');
  res.status(200).json({
    status: 'ok',
    service: 'bot',
    message: 'Bot service is starting up',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Catch-all route for any unexpected requests
healthApp.use('*', (req, res) => {
  console.log('🔧 Bot service received unexpected request:', req.method, req.path);
  console.log('🔧 Request headers:', req.headers);
  res.status(200).json({
    status: 'ok',
    service: 'bot',
    message: 'Bot service is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

class DeliveryBot {
  constructor() {
    this.botManager = BotServiceManager.getInstance();
    this.schedulerService = new SchedulerService(this.botManager.getWhatsAppService());
    this.healthCheckService = new HealthCheckService(this.botManager.getWhatsAppService());
    this.isShuttingDown = false;
  }

  async start() {
    try {
      // Create logs directory if it doesn't exist
      const logsDir = path.join(__dirname, '..', 'logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      logger.info('Starting Delivery Bot...');

      // Start health check server IMMEDIATELY (before anything else)
      console.log('🔧 Starting health check server...');
      console.log('🔧 Health check server will listen on port:', HEALTH_PORT);
      
      const server = healthApp.listen(HEALTH_PORT, () => {
        console.log(`🔧 Bot health check server running on port ${HEALTH_PORT}`);
        console.log(`🔧 Health check available at: http://localhost:${HEALTH_PORT}/health`);
        console.log(`🔧 Health check server started successfully!`);
      });

      // Handle server errors
      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`🔧 Port ${HEALTH_PORT} is already in use. Trying alternative port...`);
          // Try alternative port
          const alternativePort = HEALTH_PORT + 1;
          const altServer = healthApp.listen(alternativePort, () => {
            console.log(`🔧 Bot health check server running on alternative port ${alternativePort}`);
            console.log(`🔧 Health check available at: http://localhost:${alternativePort}/health`);
          });
          
          altServer.on('error', (altError) => {
            console.error('🔧 Alternative port also failed:', altError);
          });
        } else {
          console.error('🔧 Server error:', error);
        }
      });

      // Initialize database
      console.log('🔧 Initializing database...');
      await database.connect();

      // Initialize bot services (both WhatsApp and Telegram)
      console.log('🔧 Initializing bot services...');
      await this.botManager.initialize();

      // Start scheduler
      console.log('🔧 Starting scheduler...');
      this.schedulerService.start();

      // Start health check heartbeat
      console.log('🔧 Starting health check heartbeat...');
      this.healthCheckService.start();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      logger.info('Delivery Bot started successfully!');
      console.log('\n🤖 Multi-Platform Delivery Bot is running!');
      console.log('📱 WhatsApp: Scan the QR code above to authenticate');
      console.log('📱 Telegram: Bot is ready to receive messages');
      console.log('⚙️  Configure your group IDs in src/config/config.js');
      console.log('📊 The bot will automatically send daily reports at 10 PM');
      console.log('📋 Pending orders will be shown at 10:30 PM');
      console.log('\nPress Ctrl+C to stop the bot');

    } catch (error) {
      logger.error('Failed to start Delivery Bot:', error);
      console.error('🔧 Bot initialization failed, but health check server should still be running');
      // Don't exit immediately - let the health check server continue running
      // process.exit(1);
    }
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      logger.info(`Received ${signal}. Shutting down gracefully...`);

      try {
        // Stop scheduler
        this.schedulerService.stop();

        // Stop health check heartbeat
        this.healthCheckService.stop();

        // Stop all bot services
        await this.botManager.shutdown();

        // Close database connection
        await database.close();

        logger.info('Delivery Bot stopped successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }
}

async function pollBotControl() {
  setInterval(async () => {
    try {
      const control = await database.query('bot_control').where({ id: 1 }).first();
      if (control && control.restart_requested) {
        // Clear the flag and update last_restart
        await database.query('bot_control').where({ id: 1 }).update({
          restart_requested: false,
          last_restart: new Date()
        });
        // Perform the restart for all platforms
        await BotServiceManager.getInstance().restartBot('all');
      }
    } catch (err) {
      console.error('Error polling bot_control:', err);
    }
  }, 5000); // Poll every 5 seconds
}

// Start memory monitoring in production for the bot process
if (process.env.NODE_ENV === 'production') {
  memoryMonitor.start();
  logger.info('Memory monitoring started (bot process)');
}

// Start the bot
const bot = new DeliveryBot();
bot.start();
pollBotControl();