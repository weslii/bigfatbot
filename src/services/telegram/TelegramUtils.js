const logger = require('../../utils/logger');

class TelegramUtils {
  static isLikelyOrder(messageText) {
    try {
      const text = messageText.toLowerCase().trim();
      
      // If message contains 'name', 'phone', and 'address', always treat as likely order
      if (text.includes('name') && text.includes('phone') && text.includes('address')) {
        return true;
      }
      
      // Skip very short messages (likely greetings, thanks, etc.)
      if (text.length < 20) {
        return false;
      }
      
      // Skip messages that are clearly not orders
      const nonOrderPatterns = [
        /^(hi|hello|hey|good morning|good afternoon|good evening|thanks|thank you|ok|okay|yes|no)$/i,
        /^(how are you|how's it going|what's up|sup)$/i,
        /^(bye|goodbye|see you|talk to you later)$/i,
        /^(lol|haha|😊|😄|👍|👋|🙏)$/i,
        /^(test|testing)$/i,
        /^(help|support|assist)$/i,
        // Status inquiry patterns
        /\b(how far|status|update|sent|delivered|shipped|track|tracking|where|when|did you|have you|is it|are you)\b/i,
        // Question patterns about existing orders
        /\b(did you send|did you deliver|have you sent|have you delivered|is it sent|is it delivered|where is|when will|what about)\b/i,
        // General inquiry patterns
        /\b(what about|what happened|what's the|any update|any news|any progress)\b/i
      ];
      
      for (const pattern of nonOrderPatterns) {
        if (pattern.test(text)) {
          return false;
        }
      }
      
      // Look for order indicators
      const orderIndicators = [
        // Phone numbers (Nigerian format) - strong indicator
        /\b(\+?234|0)[789][01]\d{8}\b/,
        /\b\d{11}\b/,
        
        // Customer name patterns (multiple words that could be names) - strong indicator
        /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/,
        
        // Specific order request patterns - strong indicator
        /\b(i want|i need|i would like|please order|can i order|i'd like to order|i want to order|i need to order)\b/i,
        
        // Address indicators - medium indicator
        /\b(address|location|deliver to|send to|house|street|road|avenue|close|drive|way|estate|phase|area|zone)\b/i,
        
        // Specific food items - medium indicator
        /\b(cake|cakes|pizza|food|bread|pastry|pastries|drink|drinks|juice|water|soda)\b/i,
        
        // Quantity indicators - medium indicator
        /\b\d+\s*(piece|pieces|pack|packs|kg|kilos|gram|grams|litre|litres|bottle|bottles|box|boxes|dozen|dozens)\b/i,
        
        // Price indicators - medium indicator
        /\b(price|cost|amount|total|naira|₦|naira|dollar|\$|pound|£)\b/i,
        
        // Delivery date/time - weak indicator
        /\b(deliver|delivery|date|time|when|today|tomorrow|next)\b/i
      ];
      
      // Score order indicators with different weights
      let score = 0;
      
      // Strong indicators (worth 3 points each)
      const strongIndicators = [
        /\b(\+?234|0)[789][01]\d{8}\b/,
        /\b\d{11}\b/,
        /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/,
        /\b(i want|i need|i would like|please order|can i order|i'd like to order|i want to order|i need to order)\b/i
      ];
      
      // Medium indicators (worth 2 points each)
      const mediumIndicators = [
        /\b(address|location|deliver to|send to|house|street|road|avenue|close|drive|way|estate|phase|area|zone)\b/i,
        /\b(cake|cakes|pizza|food|bread|pastry|pastries|drink|drinks|juice|water|soda)\b/i,
        /\b\d+\s*(piece|pieces|pack|packs|kg|kilos|gram|grams|litre|litres|bottle|bottles|box|boxes|dozen|dozens)\b/i,
        /\b(price|cost|amount|total|naira|₦|naira|dollar|\$|pound|£)\b/i
      ];
      
      // Weak indicators (worth 1 point each)
      const weakIndicators = [
        /\b(deliver|delivery|date|time|when|today|tomorrow|next)\b/i
      ];
      
      // Calculate weighted score
      for (const indicator of strongIndicators) {
        if (indicator.test(text)) {
          score += 3;
        }
      }
      
      for (const indicator of mediumIndicators) {
        if (indicator.test(text)) {
          score += 2;
        }
      }
      
      for (const indicator of weakIndicators) {
        if (indicator.test(text)) {
          score += 1;
        }
      }
      
      // Message is likely an order if it has a score of 4 or higher
      // or if it's longer than 80 characters and has a score of 2 or higher
      return score >= 4 || (text.length > 80 && score >= 2);
      
    } catch (error) {
      logger.error('Error in Telegram isLikelyOrder check:', error);
      // If there's an error, be conservative and assume it might be an order
      return true;
    }
  }

  static extractOrderIdFromMessage(messageText) {
    if (!messageText) return null;
    
    // Try to extract order ID from the message
    const orderIdMatch = messageText.match(/#(\d+)/);
    if (orderIdMatch) {
      return orderIdMatch[1];
    }
    
    // Fallback: try to extract from the entire message
    const fallbackMatch = messageText.match(/(?:order|order id|order number|#)\s*:?\s*(\d+)/i);
    if (fallbackMatch) {
      return fallbackMatch[1];
    }
    
    return null;
  }

  static fallbackExtractOrderId(messageText) {
    if (!messageText) return null;
    
    // Look for any sequence of 3-6 digits that might be an order ID
    const digitMatch = messageText.match(/\b(\d{3,6})\b/);
    if (digitMatch) {
      return digitMatch[1];
    }
    
    return null;
  }

  static formatTelegramMessage(text, options = {}) {
    // Escape special characters for Telegram Markdown
    const escapedText = text
      .replace(/([_*[\]()~`>#+=|{}.!-])/g, '\\$1')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t');

    return escapedText;
  }

  static createInlineKeyboard(buttons) {
    return {
      reply_markup: {
        inline_keyboard: buttons
      }
    };
  }

  static createReplyKeyboard(buttons, options = {}) {
    return {
      reply_markup: {
        keyboard: buttons,
        resize_keyboard: options.resize || true,
        one_time_keyboard: options.oneTime || false,
        selective: options.selective || false
      }
    };
  }

  static removeKeyboard() {
    return {
      reply_markup: {
        remove_keyboard: true
      }
    };
  }

  static formatOrderMessage(order) {
    return `📋 **Order #${order.order_id}**\n\n` +
           `👤 Customer: ${order.customer_name}\n` +
           `📞 Phone: ${order.customer_phone}\n` +
           `📍 Address: ${order.delivery_address}\n` +
           `📦 Items: ${order.items}\n` +
           `💰 Total: ₦${order.total_amount}\n` +
           `📅 Delivery Date: ${order.delivery_date || 'Not specified'}\n` +
           `📝 Notes: ${order.notes || 'None'}\n\n` +
           `🕒 Created: ${new Date(order.created_at).toLocaleString()}\n` +
           `📊 Status: ${order.status}`;
  }

  static formatDeliveryConfirmation(order) {
    return `✅ **Order Delivered**\n\n` +
           `📋 Order #${order.order_id}\n` +
           `👤 Customer: ${order.customer_name}\n` +
           `📞 Phone: ${order.customer_phone}\n` +
           `📍 Address: ${order.delivery_address}\n` +
           `📦 Items: ${order.items}\n` +
           `💰 Total: ₦${order.total_amount}\n\n` +
           `🚚 Delivered by: ${order.delivered_by}\n` +
           `⏰ Delivered at: ${new Date(order.delivered_at).toLocaleString()}`;
  }

  static formatCancellationConfirmation(order) {
    return `❌ **Order Cancelled**\n\n` +
           `📋 Order #${order.order_id}\n` +
           `👤 Customer: ${order.customer_name}\n` +
           `📞 Phone: ${order.customer_phone}\n` +
           `📍 Address: ${order.delivery_address}\n` +
           `📦 Items: ${order.items}\n` +
           `💰 Total: ₦${order.total_amount}\n\n` +
           `🚫 Cancelled by: ${order.cancelled_by}\n` +
           `⏰ Cancelled at: ${new Date(order.cancelled_at).toLocaleString()}\n` +
           `📝 Reason: ${order.cancellation_reason || 'Not specified'}`;
  }

  static formatHelpMessage(groupType) {
    if (groupType === 'sales') {
      return `📋 **Sales Group Commands**\n\n` +
             `📊 /daily - View today's orders\n` +
             `📋 /pending - View pending orders\n` +
             `📈 /weekly - View weekly report\n` +
             `📅 /monthly - View monthly report\n` +
             `❓ /help - Show this help message\n\n` +
             `📝 **Order Format Example:**\n` +
             `John Doe\n` +
             `08012345678\n` +
             `123 Lekki Phase 1, Lagos\n` +
             `2 Cakes, 1 Pizza\n` +
             `To be delivered on the 23rd.`;
    } else {
      return `🚚 **Delivery Group Commands**\n\n` +
             `✅ Reply "done" to an order to mark as delivered\n` +
             `❌ Reply "cancel" to an order to cancel it\n` +
             `✅ done #ORDER_ID - Mark order as delivered\n` +
             `❌ cancel #ORDER_ID - Cancel an order\n` +
             `📊 /daily - View today's orders\n` +
             `📋 /pending - View pending orders\n` +
             `📈 /weekly - View weekly report\n` +
             `📅 /monthly - View monthly report\n` +
             `❓ /help - Show this help message`;
    }
  }
}

module.exports = TelegramUtils; 