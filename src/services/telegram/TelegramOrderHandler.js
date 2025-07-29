const database = require('../../config/database');
const logger = require('../../utils/logger');
const OrderService = require('../OrderService');
const MessageService = require('../MessageService');

class TelegramOrderHandler {
  constructor(coreService) {
    this.core = coreService;
  }

  async handleReplyCompletion(message, senderName, groupInfo) {
    try {
      // For Telegram, we need to handle reply messages differently
      // Check if this is a reply to a message
      if (message.reply_to_message) {
        const quotedMessage = message.reply_to_message;
        
        // Extract order ID using fallback method if the main method fails
        let orderId = null;
        try {
          if (typeof this.extractOrderIdFromMessage === 'function') {
            orderId = this.extractOrderIdFromMessage(quotedMessage.text);
          } else {
            // Fallback extraction method
            orderId = this.fallbackExtractOrderId(quotedMessage.text);
          }
        } catch (extractError) {
          logger.error('Error extracting order ID:', extractError);
          orderId = this.fallbackExtractOrderId(quotedMessage.text);
        }
        
        if (orderId) {
          await this.markOrderAsDelivered(orderId, senderName, groupInfo);
        } else {
          await this.core.sendMessage(groupInfo.telegram_chat_id, '❌ Could not find order ID in the replied message. Please try using: done #<order_id>');
        }
      } else {
        // If not a reply, try to extract order ID from the message itself
        const messageText = message.text || '';
        const orderId = this.extractOrderIdFromMessage(messageText) || this.fallbackExtractOrderId(messageText);
        
        if (orderId) {
          await this.markOrderAsDelivered(orderId, senderName, groupInfo);
        } else {
          await this.core.sendMessage(groupInfo.telegram_chat_id, '❌ Could not find order ID. Please reply to an order message or use: done #<order_id>');
        }
      }
    } catch (error) {
      logger.error('Error handling Telegram reply completion:', error);
      await this.core.sendMessage(groupInfo.telegram_chat_id, '❌ Error processing reply. Please try using: done #<order_id>');
    }
  }

  async handleReplyCancellation(message, senderName, senderNumber, groupInfo) {
    try {
      // For Telegram, we need to handle reply messages differently
      // Check if this is a reply to a message
      if (message.reply_to_message) {
        const quotedMessage = message.reply_to_message;
        
        // Extract order ID using fallback method if the main method fails
        let orderId = null;
        try {
          if (typeof this.extractOrderIdFromMessage === 'function') {
            orderId = this.extractOrderIdFromMessage(quotedMessage.text);
          } else {
            // Fallback extraction method
            orderId = this.fallbackExtractOrderId(quotedMessage.text);
          }
        } catch (extractError) {
          logger.error('Error extracting order ID:', extractError);
          orderId = this.fallbackExtractOrderId(quotedMessage.text);
        }
        
        if (orderId) {
          await this.cancelOrder(orderId, senderName, senderNumber, groupInfo);
        } else {
          await this.core.sendMessage(groupInfo.telegram_chat_id, '❌ Could not find order ID in the replied message. Please try using: cancel #<order_id>');
        }
      } else {
        // If not a reply, try to extract order ID from the message itself
        const messageText = message.text || '';
        const orderId = this.extractOrderIdFromMessage(messageText) || this.fallbackExtractOrderId(messageText);
        
        if (orderId) {
          await this.cancelOrder(orderId, senderName, senderNumber, groupInfo);
        } else {
          await this.core.sendMessage(groupInfo.telegram_chat_id, '❌ Could not find order ID. Please reply to an order message or use: cancel #<order_id>');
        }
      }
    } catch (error) {
      logger.error('Error handling Telegram reply cancellation:', error);
      await this.core.sendMessage(groupInfo.telegram_chat_id, '❌ Error processing reply. Please try using: cancel #<order_id>');
    }
  }

  async markOrderAsDelivered(orderId, deliveryPerson, groupInfo) {
    try {
      // Debug log for order lookup
      logger.info(`[markOrderAsDelivered] Looking up order`, { orderId, businessId: groupInfo.business_id });
      const order = await OrderService.getOrderById(orderId, groupInfo.business_id);
      if (!order) {
        await this.core.sendMessage(groupInfo.telegram_chat_id, `❌ Order #${orderId} not found.`);
        return;
      }

      if (order.status === 'delivered') {
        await this.core.sendMessage(groupInfo.telegram_chat_id, `ℹ️ Order #${orderId} is already marked as delivered.`);
        return;
      }

      if (order.status === 'cancelled') {
        await this.core.sendMessage(groupInfo.telegram_chat_id, `❌ Cannot mark cancelled order #${orderId} as delivered.`);
        return;
      }

      await OrderService.updateOrderStatus(orderId, 'delivered', deliveryPerson, groupInfo.business_id);
      
      // Send delivery confirmation to the group where delivery was marked
      await this.core.sendMessage(groupInfo.telegram_chat_id, `✅ Order #${orderId} marked as delivered by ${deliveryPerson}.`);
      
      logger.info('Order marked as delivered via Telegram', { orderId, deliveryPerson, businessId: groupInfo.business_id });
    } catch (error) {
      logger.error('Error marking order as delivered via Telegram:', error);
      await this.core.sendMessage(groupInfo.telegram_chat_id, `❌ Error updating order #${orderId}. Please try again.`);
    }
  }

  async cancelOrder(orderId, cancelledBy, cancelledByNumber, groupInfo) {
    try {
      const order = await OrderService.getOrderById(orderId, groupInfo.business_id);
      if (!order) {
        await this.core.sendMessage(groupInfo.telegram_chat_id, `❌ Order #${orderId} not found.`);
        return;
      }

      if (order.status === 'cancelled') {
        await this.core.sendMessage(groupInfo.telegram_chat_id, `ℹ️ Order #${orderId} is already cancelled.`);
        return;
      }

      if (order.status === 'delivered') {
        await this.core.sendMessage(groupInfo.telegram_chat_id, `❌ Cannot cancel delivered order #${orderId}.`);
        return;
      }

      await OrderService.updateOrderStatus(orderId, 'cancelled', cancelledBy, groupInfo.business_id);
      
      // Send cancellation confirmation
      await this.core.sendMessage(groupInfo.telegram_chat_id, `❌ Order #${orderId} cancelled by ${cancelledBy}.`);
      
      logger.info('Order cancelled via Telegram', { orderId, cancelledBy, businessId: groupInfo.business_id });
    } catch (error) {
      logger.error('Error cancelling order via Telegram:', error);
      await this.core.sendMessage(groupInfo.telegram_chat_id, `❌ Error cancelling order #${orderId}. Please try again.`);
    }
  }

  async sendHelpMessage(groupInfo) {
    try {
      const helpMessage = 
        `🤖 *Telegram Bot Commands*\n\n` +
        `*Delivery Commands:*\n` +
        `• Reply to an order with "done" to mark as delivered\n` +
        `• Reply to an order with "cancel" to cancel the order\n` +
        `• Or use: done #<order_id> or cancel #<order_id>\n\n` +
        `*Report Commands:*\n` +
        `• /daily - Daily order report\n` +
        `• /weekly - Weekly order report\n` +
        `• /monthly - Monthly order report\n` +
        `• /pending - Show pending orders\n` +
        `• /help - Show this help message\n\n` +
        `*Setup Commands:*\n` +
        `• /setup <businessname-CODE> - Setup business groups`;

      await this.core.sendMessage(groupInfo.telegram_chat_id, helpMessage);
    } catch (error) {
      logger.error('Error sending Telegram help message:', error);
    }
  }

  async sendDailyReport(groupInfo) {
    try {
      const report = await OrderService.getDailyReport(groupInfo.business_id);
      const message = MessageService.formatDailyReport(report, new Date());
      await this.core.sendMessage(groupInfo.telegram_chat_id, message);
    } catch (error) {
      logger.error('Error sending Telegram daily report:', error);
      await this.core.sendMessage(groupInfo.telegram_chat_id, '❌ Error generating daily report.');
    }
  }

  async sendPendingOrders(groupInfo) {
    try {
      const pendingOrders = await OrderService.getPendingOrders(groupInfo.business_id);
      const message = MessageService.formatPendingOrders(pendingOrders);
      await this.core.sendMessage(groupInfo.telegram_chat_id, message);
    } catch (error) {
      logger.error('Error sending Telegram pending orders:', error);
      await this.core.sendMessage(groupInfo.telegram_chat_id, '❌ Error fetching pending orders.');
    }
  }

  async sendWeeklyReport(groupInfo) {
    try {
      const report = await OrderService.getWeeklyReport(groupInfo.business_id);
      const message = MessageService.formatWeeklyReport(report);
      await this.core.sendMessage(groupInfo.telegram_chat_id, message);
    } catch (error) {
      logger.error('Error sending Telegram weekly report:', error);
      await this.core.sendMessage(groupInfo.telegram_chat_id, '❌ Error generating weekly report.');
    }
  }

  async sendMonthlyReport(groupInfo) {
    try {
      const report = await OrderService.getMonthlyReport(groupInfo.business_id);
      const message = MessageService.formatMonthlyReport(report);
      await this.core.sendMessage(groupInfo.telegram_chat_id, message);
    } catch (error) {
      logger.error('Error sending Telegram monthly report:', error);
      await this.core.sendMessage(groupInfo.telegram_chat_id, '❌ Error generating monthly report.');
    }
  }

  extractOrderIdFromMessage(messageText) {
    if (!messageText) return null;
    
    // Look for order ID patterns like #123, Order #123, etc.
    const orderIdPattern = /(?:order\s*#?|#)\s*(\d+)/i;
    const match = messageText.match(orderIdPattern);
    
    if (match) {
      return match[1];
    }
    
    return null;
  }

  fallbackExtractOrderId(messageText) {
    if (!messageText) return null;
    
    // Look for any number that might be an order ID
    const numberPattern = /\b(\d{1,6})\b/g;
    const matches = messageText.match(numberPattern);
    
    if (matches && matches.length > 0) {
      // Return the first number found (most likely to be order ID)
      return matches[0];
    }
    
    return null;
  }
}

module.exports = TelegramOrderHandler; 