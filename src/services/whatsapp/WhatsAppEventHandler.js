const qrcode = require('qrcode');
const logger = require('../../utils/logger');
const NotificationService = require('../NotificationService');

class WhatsAppEventHandler {
  constructor(coreService) {
    this.core = coreService;
    this.setupHandlers();
  }

  setupHandlers() {
    this.core.client.on('qr', async (qr) => {
      try {
        const qrDataUrl = await qrcode.toDataURL(qr, {
          errorCorrectionLevel: 'H',
          margin: 4,
          scale: 8
        });
        this.core.latestQrDataUrl = qrDataUrl;
        this.core.isAuthenticated = false;
        logger.info('=== NEW QR CODE GENERATED ===');
        logger.info('Please scan this QR code using WhatsApp mobile app.');
        logger.info('You have 30 seconds to scan before a new code is generated.');
        logger.info('To view the QR code, copy this URL and open it in a browser:');
        logger.info(qrDataUrl);
        logger.info('================================');
      } catch (error) {
        logger.error('Error generating QR code:', error);
      }
    });

    this.core.client.on('ready', async () => {
      logger.info('=== CLIENT READY EVENT FIRED ===');
      this.core.isAuthenticated = true;
      this.core.latestQrDataUrl = null;
      logger.info('WhatsApp client is ready');
      logger.info('isAuthenticated set to:', this.core.isAuthenticated);
      
      // Store connection status in database for cross-process access
      await this.core.storeConnectionStatus('connected', this.core.client.info?.wid?.user);
      
      // Send connection restored notification
      try {
        await NotificationService.notifyConnectionRestored({
          'Reconnection Time': '2.5 seconds',
          'Previous Status': 'Disconnected'
        });
      } catch (notificationError) {
        logger.error('Error sending connection restored notification:', notificationError);
      }
    });

    this.core.client.on('authenticated', () => {
      logger.info('=== CLIENT AUTHENTICATED EVENT FIRED ===');
      this.core.isAuthenticated = true;
      this.core.latestQrDataUrl = null;
      logger.info('WhatsApp client is authenticated');
      logger.info('isAuthenticated set to:', this.core.isAuthenticated);
      
      // Store connection status in database for cross-process access
      this.core.storeConnectionStatus('authenticated', this.core.client.info?.wid?.user);
      
      // WORKAROUND: If ready event doesn't fire within 10 seconds, manually trigger ready state
      setTimeout(async () => {
        if (this.core.client && this.core.client.info && this.core.client.info.wid) {
          logger.info('=== MANUAL READY STATE TRIGGERED (authenticated event workaround) ===');
          this.core.isAuthenticated = true;
          this.core.latestQrDataUrl = null;
          logger.info('WhatsApp client is ready (manual trigger)');
          
          // Store connection status in database for cross-process access
          await this.core.storeConnectionStatus('connected', this.core.client.info?.wid?.user);
          
          // Send connection restored notification
          try {
            await NotificationService.notifyConnectionRestored({
              'Reconnection Time': 'Manual trigger',
              'Previous Status': 'Authenticated but ready event missing'
            });
          } catch (notificationError) {
            logger.error('Error sending connection restored notification:', notificationError);
          }
        }
      }, 10000); // 10 second delay
    });

    this.core.client.on('auth_failure', async (error) => {
      logger.info('=== CLIENT AUTH FAILURE EVENT FIRED ===');
      this.core.isAuthenticated = false;
      logger.error('WhatsApp authentication failed:', error);
      logger.info('isAuthenticated set to:', this.core.isAuthenticated);
      
      // Store connection status in database for cross-process access
      await this.core.storeConnectionStatus('auth_failure', null);
      
      // Start continuous authentication error notifications
      try {
        const authError = new Error(`WhatsApp authentication failed: ${error.message || error}`);
        NotificationService.startContinuousErrorNotification('connection', authError, {
          'Error Type': 'Authentication Failure',
          'Failure Time': new Date().toISOString()
        });
      } catch (notificationError) {
        logger.error('Error starting continuous authentication error notification:', notificationError);
      }
    });

    this.core.client.on('disconnected', async (reason) => {
      logger.info('=== CLIENT DISCONNECTED EVENT FIRED ===');
      this.core.isAuthenticated = false;
      this.core.latestQrDataUrl = null;
      logger.warn('WhatsApp client disconnected:', reason);
      logger.info('isAuthenticated set to:', this.core.isAuthenticated);
      
      // Store connection status in database for cross-process access
      await this.core.storeConnectionStatus('disconnected', null);
      
      // Start continuous connection error notifications
      try {
        const disconnectError = new Error(`WhatsApp disconnected: ${reason}`);
        NotificationService.startContinuousErrorNotification('connection', disconnectError, {
          'Disconnect Reason': reason,
          'Last Connected': new Date().toISOString()
        });
      } catch (notificationError) {
        logger.error('Error starting continuous connection error notification:', notificationError);
      }
    });
  }
}

module.exports = WhatsAppEventHandler; 