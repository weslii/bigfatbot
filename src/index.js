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

// Now load database after environment check
const database = require('./config/database');
const MessageService = require('./services/MessageService');
const SchedulerService = require('./services/SchedulerService');
const HealthCheckService = require('./services/HealthCheckService');

// --- Health check endpoint for Railway worker ---
const express = require('express');
const healthApp = express();
const isProduction = process.env.NODE_ENV === 'production';
const HEALTH_PORT = isProduction
  ? process.env.PORT
  : (process.env.BOT_PORT || 3001);

healthApp.get('/health', (req, res) => {
  res.status(200).send('ok');
});

class DeliveryBot {
  constructor() {
    this.messageService = new MessageService();
    this.schedulerService = new SchedulerService(this.messageService);
    this.healthCheckService = new HealthCheckService(this.messageService);
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

      // Initialize database
      await database.connect();

      // Start all messaging services in the background
      this.messageService.startAll().catch(error => {
        logger.error('Failed to start messaging services:', error);
      });
      
      // Make services available globally for monitoring
      global.whatsappService = this.messageService.getPlatformService('whatsapp');
      global.telegramService = this.messageService.getPlatformService('telegram');

      // Start scheduler
      this.schedulerService.start();

      // Start health check heartbeat
      this.healthCheckService.start();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      // Start health check server after bot is initialized
      healthApp.listen(HEALTH_PORT, () => {
        console.log(`Bot health check server running on port ${HEALTH_PORT}`);
      });

      logger.info('Delivery Bot started successfully!');
      console.log('\n🤖 Multi-Platform Delivery Bot is running!');
      
      // Show platform status
      if (process.env.ENABLE_WHATSAPP === 'true') {
        console.log('📱 WhatsApp: Ready for QR authentication');
      }
      if (process.env.ENABLE_TELEGRAM === 'true') {
        console.log('📲 Telegram: Ready for bot setup');
      }
      
      console.log('⚙️  Configure your group IDs in src/config/config.js');
      console.log('📊 The bot will automatically send daily reports at 10 PM');
      console.log('📋 Pending orders will be shown at 10:30 PM');
      console.log('\nPress Ctrl+C to stop the bot');

    } catch (error) {
      logger.error('Failed to start Delivery Bot:', error);
      process.exit(1);
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

        // Stop all messaging services
        await this.messageService.stopAll();

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
        const messageService = new MessageService();
        await messageService.restart('whatsapp');
        if (process.env.ENABLE_TELEGRAM === 'true') {
          await messageService.restart('telegram');
        }
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