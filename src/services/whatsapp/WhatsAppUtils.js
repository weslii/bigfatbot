const logger = require('../../utils/logger');

class WhatsAppUtils {
  static isLikelyOrder(messageText) {
    try {
      const text = messageText.toLowerCase().trim();
      // New: If message contains 'name', 'phone', and 'address', always treat as likely order
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
      logger.error('Error in isLikelyOrder check:', error);
      // If there's an error, be conservative and assume it might be an order
      return true;
    }
  }

  static extractOrderIdFromMessage(messageText) {
    try {
      // Look for new order ID pattern: XXX-YYYYMMDD-XXX (where XXX is alphanumeric)
      const orderIdMatch = messageText.match(/([A-Z0-9]{3}-\d{8}-\d{3})/);
      if (orderIdMatch) {
        return orderIdMatch[1];
      }
      // Fallback: old pattern (just in case)
      const oldOrderIdMatch = messageText.match(/(\d{8}-\d{3})/);
      if (oldOrderIdMatch) {
        return oldOrderIdMatch[1];
      }
      // Also look for "Order ID:" pattern
      const orderIdPattern = messageText.match(/Order ID:\s*([^\n]+)/);
      if (orderIdPattern) {
        return orderIdPattern[1].trim();
      }
      return null;
    } catch (error) {
      logger.error('Error extracting order ID from message:', error);
      return null;
    }
  }

  static fallbackExtractOrderId(messageText) {
    try {
      // Look for new order ID pattern: XXX-YYYYMMDD-XXX (where XXX is alphanumeric)
      const orderIdMatch = messageText.match(/([A-Z0-9]{3}-\d{8}-\d{3})/);
      if (orderIdMatch) {
        return orderIdMatch[1];
      }
      // Fallback: old pattern (just in case)
      const oldOrderIdMatch = messageText.match(/(\d{8}-\d{3})/);
      if (oldOrderIdMatch) {
        return oldOrderIdMatch[1];
      }
      // Also look for "Order ID:" pattern
      const orderIdPattern = messageText.match(/Order ID:\s*([^\n]+)/);
      if (orderIdPattern) {
        return orderIdPattern[1].trim();
      }
      return null;
    } catch (error) {
      logger.error('Error in fallback order ID extraction:', error);
      return null;
    }
  }

  static formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;
    // Remove 234 prefix and add 0
    if (phoneNumber.startsWith('234')) {
      return '0' + phoneNumber.substring(3);
    }
    return phoneNumber;
  }
}

module.exports = WhatsAppUtils; 