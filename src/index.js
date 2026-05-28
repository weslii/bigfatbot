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
const NotificationService = require('./services/NotificationService');
const AppSettingsService = require('./services/AppSettingsService');

// --- Health check endpoint for Railway worker ---
const express = require('express');
const healthApp = express();
const isProduction = process.env.NODE_ENV === 'production';
const HEALTH_PORT = (() => {
  const raw =
    (isProduction ? process.env.PORT : null) ??
    process.env.BOT_PORT ??
    '3001';
  const port = Number(raw);
  return Number.isFinite(port) && port > 0 ? port : 3001;
})();

healthApp.get('/health', (req, res) => {
  res.status(200).send('ok');
});

class DeliveryBot {
  constructor() {
    this.botManager = BotServiceManager.getInstance();
    this.schedulerService = new SchedulerService(this.botManager.getWhatsAppService());
    this.healthCheckService = new HealthCheckService(this.botManager.getWhatsAppService());
    this.isShuttingDown = false;
    this.settingsRefreshInterval = null;
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

      // Ensure settings row exists (non-fatal if migrations haven't run yet)
      await AppSettingsService.ensureDefaults();

      // Apply current notifications setting immediately
      try {
        const [continuousEnabled, disconnectedEnabled, emailEnabled, telegramEnabled] = await Promise.all([
          AppSettingsService.getBoolean('continuous_notifications_enabled', true),
          AppSettingsService.getBoolean('disconnected_error_notifications_enabled', true),
          AppSettingsService.getBoolean('email_notifications_enabled', true),
          AppSettingsService.getBoolean('telegram_notifications_enabled', true),
        ]);
        NotificationService.setContinuousNotificationsEnabled(continuousEnabled);
        NotificationService.setDisconnectedErrorNotificationsEnabled(disconnectedEnabled);
        NotificationService.setEmailNotificationsEnabled(emailEnabled);
        NotificationService.setTelegramNotificationsEnabled(telegramEnabled);
      } catch (e) {
        logger.warn('Failed to apply notification settings on boot (continuing):', e.message);
      }

      // Refresh settings periodically so dashboard changes take effect quickly
      this.settingsRefreshInterval = setInterval(async () => {
        try {
          const [continuousEnabled, disconnectedEnabled, emailEnabled, telegramEnabled] = await Promise.all([
            AppSettingsService.getBoolean('continuous_notifications_enabled', true),
            AppSettingsService.getBoolean('disconnected_error_notifications_enabled', true),
            AppSettingsService.getBoolean('email_notifications_enabled', true),
            AppSettingsService.getBoolean('telegram_notifications_enabled', true),
          ]);

          if (NotificationService.isContinuousNotificationsEnabled() !== continuousEnabled) {
            NotificationService.setContinuousNotificationsEnabled(continuousEnabled);
          }
          if (NotificationService.isDisconnectedErrorNotificationsEnabled() !== disconnectedEnabled) {
            NotificationService.setDisconnectedErrorNotificationsEnabled(disconnectedEnabled);
          }
          if (NotificationService.isEmailNotificationsEnabled() !== emailEnabled) {
            NotificationService.setEmailNotificationsEnabled(emailEnabled);
          }
          if (NotificationService.isTelegramNotificationsEnabled() !== telegramEnabled) {
            NotificationService.setTelegramNotificationsEnabled(telegramEnabled);
          }
        } catch (e) {
          // keep quiet-ish to avoid log spam
          logger.warn('Settings refresh failed (continuing):', e.message);
        }
      }, 15000);

      // Initialize bot services (both WhatsApp and Telegram)
      await this.botManager.initialize();

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
      console.log('📱 WhatsApp: Scan the QR code above to authenticate');
      console.log('📱 Telegram: Bot is ready to receive messages');
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
        if (this.settingsRefreshInterval) {
          clearInterval(this.settingsRefreshInterval);
          this.settingsRefreshInterval = null;
        }

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