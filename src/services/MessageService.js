// src/services/MessageService.js
const moment = require('moment');
const WhatsAppService = require('./WhatsAppService');
const TelegramService = require('./TelegramService');
const logger = require('../utils/logger');

class MessageService {
  constructor() {
    this.whatsappService = WhatsAppService.getInstance();
    this.telegramService = TelegramService.getInstance();
    this.platforms = {
      whatsapp: this.whatsappService,
      telegram: this.telegramService
    };
  }

  // ===== ORIGINAL STATIC METHODS (for backward compatibility) =====
  
  static formatOrderConfirmation(order) {
    try {
      let message = `✅ *Order Received*\n\n`;
      message += `*Order ID:* ${order.order_id}\n`;
      message += `*Customer:* ${order.customer_name}\n`;
      message += `*Phone:* ${order.customer_phone}\n`;
      message += `*Address:* ${order.address}\n`;
      message += `*Items:* ${order.items}\n`;
      if (order.delivery_date) {
        message += `*Delivery Date:* ${moment(order.delivery_date).format('DD/MM/YYYY')}\n`;
      } else if (order.delivery_date_raw) {
        message += `*Delivery Date:* ${order.delivery_date_raw}\n`;
      }
      if (order.notes) {
        message += `\n*Notes:* ${order.notes}\n`;
      }
      message += `\n💡 *To mark as delivered:* Reply "done" to this message or type "done #${order.order_id}"`;
      message += `\n💡 *To cancel order:* Reply "cancel" to this message or type "cancel #${order.order_id}"`;
      return message;
    } catch (error) {
      logger.error('Error formatting order confirmation:', error);
      return 'Error formatting order confirmation';
    }
  }

  static formatSalesConfirmation(order) {
    try {
      let message = `🛍️ *New Order Received*\n\n`;
      message += `*Order ID:* ${order.order_id}\n`;
      message += `*Customer:* ${order.customer_name}\n`;
      message += `*Phone:* ${order.customer_phone}\n`;
      message += `*Address:* ${order.address}\n`;
      message += `*Items:* ${order.items}\n`;
      if (order.delivery_date) {
        message += `*Delivery Date:* ${moment(order.delivery_date).format('DD/MM/YYYY')}\n`;
      } else if (order.delivery_date_raw) {
        message += `*Delivery Date:* ${order.delivery_date_raw}\n`;
      }
      if (order.notes) {
        message += `\n*Notes:* ${order.notes}\n`;
      }
      message += `\n💡 *To cancel order:* Reply "cancel" to this message or type "cancel #${order.order_id}"`;
      return message;
    } catch (error) {
      logger.error('Error formatting sales confirmation:', error);
      return 'Error formatting sales confirmation';
    }
  }

  static formatPendingOrders(orders) {
    try {
      if (!orders || orders.length === 0) {
        return `🟢 *No Pending Orders!*

There are currently no pending orders. 🎉`;
      }

      let message = `📋 *Pending Orders*\n\n`;
     
      orders.forEach((order, index) => {
          message += `*${index + 1}. Order ID:* ${order.order_id}\n`;
          message += `*Customer:* ${order.customer_name}\n`;
          message += `*Phone:* ${order.customer_phone}\n`;
          message += `*Address:* ${order.address}\n`;
          message += `*Items:* ${order.items}\n`;
          
          if (order.delivery_date) {
            message += `*Delivery Date:* ${moment(order.delivery_date).format('DD/MM/YYYY')}\n`;
          }
          
          if (order.notes) {
            message += `*Notes:* ${order.notes}\n`;
          }
          
          message += '\n';
        });

      return message;
    } catch (error) {
      logger.error('Error formatting pending orders:', error);
      return 'Error formatting pending orders';
    }
  }

  static formatDailyReport(report) {
    try {
      let message = `📊 *Daily Report*\n\n`;
      message += `*Total Orders:* ${report.total_orders}\n`;
      message += `*Delivered:* ${report.delivered_orders}\n`;
      message += `*Cancelled:* ${report.cancelled_orders}\n`;
      message += `*Pending Deliveries:* ${report.scheduled_deliveries}\n`;
      return message;
    } catch (error) {
      logger.error('Error formatting daily report:', error);
      return 'Error formatting daily report';
    }
  }

  static formatWeeklyReport(report) {
    try {
      let message = `📊 *Weekly Report*\n\n`;
      message += `*Total Orders:* ${report.total_orders}\n`;
      message += `*Delivered:* ${report.delivered_orders}\n`;
      message += `*Cancelled:* ${report.cancelled_orders}\n`;
      message += `*Pending Deliveries:* ${report.scheduled_deliveries}\n`;
      return message;
    } catch (error) {
      logger.error('Error formatting weekly report:', error);
      return 'Error formatting weekly report';
    }
  }

  static formatMonthlyReport(report) {
    try {
      let message = `📊 *Monthly Report*\n\n`;
      message += `*Total Orders:* ${report.total_orders}\n`;
      message += `*Delivered:* ${report.delivered_orders}\n`;
      message += `*Cancelled:* ${report.cancelled_orders}\n`;
      message += `*Pending Deliveries:* ${report.scheduled_deliveries}\n`;
      return message;
    } catch (error) {
      logger.error('Error formatting monthly report:', error);
      return 'Error formatting monthly report';
    }
  }

  static formatHelpMessage() {
    return `*Available Commands:*\n\n` +
           `*Order Management:*\n` +
           `• /pending - View pending orders\n` +
           `• done #<order_id> - Mark order as delivered\n` +
           `• cancel #<order_id> - Cancel an order\n` +
           `• Reply "done" to an order message - Mark as delivered\n` +
           `• Reply "cancel" to an order message - Cancel order\n\n` +
           `*Reports:*\n` +
           `• /daily - View today's report\n` +
           `• /weekly - View weekly report\n` +
           `• /monthly - View monthly report\n\n` +
           `*Help:*\n` +
           `• /help - Show this help message`;
  }

  // ===== NEW PLATFORM-SPECIFIC METHODS =====

  async startAll() {
    try {
      logger.info('Starting all messaging services...');
      
      // Start WhatsApp service
      if (process.env.ENABLE_WHATSAPP !== 'false') {
        await this.whatsappService.start();
        logger.info('WhatsApp service started');
      } else {
        logger.info('WhatsApp service disabled');
      }

      // Start Telegram service
      if (process.env.ENABLE_TELEGRAM === 'true' && process.env.TELEGRAM_BOT_TOKEN) {
        await this.telegramService.start();
        logger.info('Telegram service started');
      } else {
        logger.info('Telegram service disabled or no token provided');
      }

      logger.info('All messaging services started successfully');
    } catch (error) {
      logger.error('Error starting messaging services:', error);
      throw error;
    }
  }

  async stopAll() {
    try {
      logger.info('Stopping all messaging services...');
      
      // Stop WhatsApp service
      if (this.whatsappService) {
        await this.whatsappService.stop();
        logger.info('WhatsApp service stopped');
      }

      // Stop Telegram service
      if (this.telegramService) {
        await this.telegramService.stop();
        logger.info('Telegram service stopped');
      }

      logger.info('All messaging services stopped successfully');
    } catch (error) {
      logger.error('Error stopping messaging services:', error);
      throw error;
    }
  }

  async sendMessage(platform, chatId, message, options = {}) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return await service.sendMessage(chatId, message, options);
    } catch (error) {
      logger.error(`Error sending message via ${platform}:`, error);
      throw error;
    }
  }

  async getBotInfo(platform) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return await service.getBotInfo();
    } catch (error) {
      logger.error(`Error getting bot info for ${platform}:`, error);
      throw error;
    }
  }

  async getAllBotInfo() {
    try {
      const botInfo = {};
      
      for (const [platform, service] of Object.entries(this.platforms)) {
        try {
          botInfo[platform] = await service.getBotInfo();
        } catch (error) {
          logger.error(`Error getting bot info for ${platform}:`, error);
          botInfo[platform] = {
            number: 'Error',
            name: `${platform} Bot`,
            status: 'error'
          };
        }
      }

      return botInfo;
    } catch (error) {
      logger.error('Error getting all bot info:', error);
      throw error;
    }
  }

  async checkAuthenticationStatus(platform) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return await service.checkAuthenticationStatus();
    } catch (error) {
      logger.error(`Error checking authentication status for ${platform}:`, error);
      throw error;
    }
  }

  async restart(platform) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return await service.restart();
    } catch (error) {
      logger.error(`Error restarting ${platform} service:`, error);
      throw error;
    }
  }

  async getConnectionStatus(platform) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return await service.getConnectionStatus();
    } catch (error) {
      logger.error(`Error getting connection status for ${platform}:`, error);
      throw error;
    }
  }

  async getAllConnectionStatus() {
    try {
      const status = {};
      
      for (const [platform, service] of Object.entries(this.platforms)) {
        try {
          status[platform] = await service.getConnectionStatus();
        } catch (error) {
          logger.error(`Error getting connection status for ${platform}:`, error);
          status[platform] = {
            status: 'error',
            phoneNumber: null
          };
        }
      }

      return status;
    } catch (error) {
      logger.error('Error getting all connection status:', error);
      throw error;
    }
  }

  async getQrStatus(platform) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return service.getLatestQrStatus();
    } catch (error) {
      logger.error(`Error getting QR status for ${platform}:`, error);
      throw error;
    }
  }

  async markOrderAsDelivered(platform, orderId, deliveryPerson, groupInfo) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return await service.markOrderAsDelivered(orderId, deliveryPerson, groupInfo);
    } catch (error) {
      logger.error(`Error marking order as delivered via ${platform}:`, error);
      throw error;
    }
  }

  async cancelOrder(platform, orderId, cancelledBy, cancelledByNumber, groupInfo) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return await service.cancelOrder(orderId, cancelledBy, cancelledByNumber, groupInfo);
    } catch (error) {
      logger.error(`Error cancelling order via ${platform}:`, error);
      throw error;
    }
  }

  async sendDailyReport(platform, groupInfo) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return await service.sendDailyReport(groupInfo);
    } catch (error) {
      logger.error(`Error sending daily report via ${platform}:`, error);
      throw error;
    }
  }

  async sendPendingOrders(platform, groupInfo) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return await service.sendPendingOrders(groupInfo);
    } catch (error) {
      logger.error(`Error sending pending orders via ${platform}:`, error);
      throw error;
    }
  }

  async sendWeeklyReport(platform, groupInfo) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return await service.sendWeeklyReport(groupInfo);
    } catch (error) {
      logger.error(`Error sending weekly report via ${platform}:`, error);
      throw error;
    }
  }

  async sendMonthlyReport(platform, groupInfo) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return await service.sendMonthlyReport(groupInfo);
    } catch (error) {
      logger.error(`Error sending monthly report via ${platform}:`, error);
      throw error;
    }
  }

  async sendHelpMessage(platform, groupInfo) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return await service.sendHelpMessage(groupInfo);
    } catch (error) {
      logger.error(`Error sending help message via ${platform}:`, error);
      throw error;
    }
  }

  async handleSetupCommand(platform, message, chat, contact) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return await service.handleSetupCommand(message, chat, contact);
    } catch (error) {
      logger.error(`Error handling setup command via ${platform}:`, error);
      throw error;
    }
  }

  async handleSetupReply(platform, message, chat, contact) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return await service.handleSetupReply(message, chat, contact);
    } catch (error) {
      logger.error(`Error handling setup reply via ${platform}:`, error);
      throw error;
    }
  }

  async generateGroupSetupQR(platform, userId, businessName) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return await service.generateGroupSetupQR(userId, businessName);
    } catch (error) {
      logger.error(`Error generating group setup QR for ${platform}:`, error);
      throw error;
    }
  }

  async getSetupStatus(platform, userId, businessName) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return await service.getSetupStatus(userId, businessName);
    } catch (error) {
      logger.error(`Error getting setup status for ${platform}:`, error);
      throw error;
    }
  }

  async getBotMetrics(platform) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return await service.getBotMetrics();
    } catch (error) {
      logger.error(`Error getting bot metrics for ${platform}:`, error);
      throw error;
    }
  }

  async getAllBotMetrics() {
    try {
      const metrics = {};
      
      for (const [platform, service] of Object.entries(this.platforms)) {
        try {
          metrics[platform] = await service.getBotMetrics();
        } catch (error) {
          logger.error(`Error getting bot metrics for ${platform}:`, error);
          metrics[platform] = {
            platform,
            messageCount: 0,
            ordersCreated: 0,
            ordersDelivered: 0,
            ordersCancelled: 0,
            processingTime: 0,
            errors: 0,
            lastUpdate: new Date()
          };
        }
      }

      return metrics;
    } catch (error) {
      logger.error('Error getting all bot metrics:', error);
      throw error;
    }
  }

  isLikelyOrder(platform, messageText) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return service.isLikelyOrder(messageText);
    } catch (error) {
      logger.error(`Error checking if message is likely order for ${platform}:`, error);
      return false;
    }
  }

  extractOrderIdFromMessage(platform, messageText) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return service.extractOrderIdFromMessage(messageText);
    } catch (error) {
      logger.error(`Error extracting order ID from message for ${platform}:`, error);
      return null;
    }
  }

  fallbackExtractOrderId(platform, messageText) {
    try {
      const service = this.platforms[platform];
      if (!service) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      return service.fallbackExtractOrderId(messageText);
    } catch (error) {
      logger.error(`Error fallback extracting order ID from message for ${platform}:`, error);
      return null;
    }
  }

  getSupportedPlatforms() {
    return Object.keys(this.platforms);
  }

  isPlatformSupported(platform) {
    return platform in this.platforms;
  }

  getPlatformService(platform) {
    return this.platforms[platform];
  }
}

module.exports = MessageService;