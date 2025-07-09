const config = require('./src/config/config');
const WhatsAppService = require('./src/services/WhatsAppService');
const logger = require('./src/utils/logger');

(async () => {
  try {
    const whatsappService = WhatsAppService.getInstance();
    await whatsappService.start();
    const client = whatsappService.core.client;
    const groupId = config.healthcheckGroupId;
    const chat = await client.getChatById(groupId);
    const messages = await chat.fetchMessages({ limit: 20 });
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    let deleted = 0;
    for (const msg of messages) {
      if (
        msg.fromMe &&
        typeof msg.body === 'string' &&
        msg.body.startsWith('🤖 Bot heartbeat:') &&
        msg.timestamp * 1000 < oneHourAgo
      ) {
        try {
          await client.deleteMessage(groupId, msg, { revoke: true });
          logger.info(`Deleted old heartbeat message ${msg.id._serialized}`);
          deleted++;
        } catch (err) {
          logger.warn(`Failed to delete old heartbeat message ${msg.id._serialized}:`, err);
        }
      }
    }
    if (deleted === 0) {
      logger.info('No old heartbeat messages found to delete.');
    }
    process.exit(0);
  } catch (error) {
    logger.error('Test delete heartbeat error:', error);
    process.exit(1);
  }
})(); 