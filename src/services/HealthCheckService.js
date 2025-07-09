const logger = require('../utils/logger');
const config = require('../config/config');

class HealthCheckService {
  constructor(whatsappService) {
    this.whatsappService = whatsappService;
    this.groupId = config.healthcheckGroupId;
    this.intervalMs = config.heartbeatIntervalMs;
    this.restartCooldownMs = config.heartbeatRestartCooldownMs;
    this.lastRestart = 0;
    this.heartbeatTimer = null;
    this.cleanupTimer = null;
  }

  start() {
    if (!this.groupId) {
      logger.warn('HealthCheckService: No healthcheck group ID configured. Heartbeat will not start.');
      return;
    }
    logger.info(`HealthCheckService: Starting heartbeat to group ${this.groupId} every ${this.intervalMs / 60000} min(s).`);
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.intervalMs);
    // Start periodic cleanup every 10 minutes
    this.cleanupTimer = setInterval(() => this.cleanupOldHeartbeats(), 10 * 60 * 1000);
  }

  stop() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  async sendHeartbeat() {
    try {
      const msg = `🤖 Bot heartbeat: ${new Date().toISOString()}`;
      // Add a 3-minute timeout (180000 ms)
      await Promise.race([
        this.whatsappService.sendMessage(this.groupId, msg),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Heartbeat send timed out after 3 minutes')), 180000))
      ]);
      logger.info('HealthCheckService: Heartbeat sent successfully.');
    } catch (err) {
      logger.error('HealthCheckService: Failed to send heartbeat:', err);
      const now = Date.now();
      if (now - this.lastRestart > this.restartCooldownMs) {
        this.lastRestart = now;
        logger.warn('HealthCheckService: Restarting WhatsApp service due to failed heartbeat...');
        try {
          await this.whatsappService.restart();
          logger.info('HealthCheckService: WhatsApp service restarted after heartbeat failure.');
        } catch (restartErr) {
          logger.error('HealthCheckService: WhatsApp service restart failed:', restartErr);
        }
      } else {
        logger.warn('HealthCheckService: Skipping restart due to cooldown.');
      }
    }
  }

  async cleanupOldHeartbeats() {
    try {
      const chat = await this.whatsappService.core.client.getChatById(this.groupId);
      const messages = await chat.fetchMessages({ limit: 50 }); // Adjust limit as needed
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      for (const msg of messages) {
        if (
          msg.fromMe &&
          typeof msg.body === 'string' &&
          msg.body.startsWith('🤖 Bot heartbeat:') &&
          msg.timestamp * 1000 < oneHourAgo
        ) {
          try {
            await this.whatsappService.deleteMessage(this.groupId, msg.id._serialized);
            logger.info(`HealthCheckService: Deleted old heartbeat message ${msg.id._serialized}`);
          } catch (err) {
            logger.warn(`HealthCheckService: Failed to delete old heartbeat message ${msg.id._serialized}:`, err);
          }
        }
      }
    } catch (err) {
      logger.warn('HealthCheckService: Error during cleanup of old heartbeat messages:', err);
    }
  }
}

module.exports = HealthCheckService; 