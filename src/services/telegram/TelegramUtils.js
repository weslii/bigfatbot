const logger = require('../../utils/logger');

class TelegramUtils {
  static isLikelyOrder(messageText) {
    if (!messageText || typeof messageText !== 'string') {
      return false;
    }

    const lowerText = messageText.toLowerCase().trim();
    
    // Order keywords that indicate this might be an order
    const orderKeywords = [
      'order', 'buy', 'purchase', 'deliver', 'delivery', 'want', 'need',
      'please', 'can i', 'i would like', 'i want', 'send me', 'bring me',
      'get me', 'i need', 'looking for', 'searching for', 'interested in'
    ];

    // Address keywords that suggest delivery
    const addressKeywords = [
      'address', 'location', 'street', 'avenue', 'road', 'drive', 'lane',
      'house', 'apartment', 'flat', 'building', 'floor', 'room', 'unit'
    ];

    // Phone number patterns
    const phonePatterns = [
      /(\+?\d{1,4}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/, // US/International
      /\d{10,15}/, // General phone number
      /(\+234|234)?[789][01]\d{8}/, // Nigerian numbers
      /(\+1)?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/ // US numbers
    ];

    // Item keywords that suggest products
    const itemKeywords = [
      'pizza', 'burger', 'food', 'meal', 'dish', 'item', 'product',
      'cake', 'bread', 'rice', 'chicken', 'beef', 'fish', 'vegetable',
      'fruit', 'drink', 'beverage', 'coffee', 'tea', 'juice', 'water',
      'snack', 'dessert', 'sweet', 'chocolate', 'ice cream'
    ];

    // Check for order keywords
    const hasOrderKeyword = orderKeywords.some(keyword => 
      lowerText.includes(keyword)
    );

    // Check for address keywords
    const hasAddress = addressKeywords.some(keyword => 
      lowerText.includes(keyword)
    );

    // Check for phone number
    const hasPhoneNumber = phonePatterns.some(pattern => 
      pattern.test(messageText)
    );

    // Check for item keywords
    const hasItems = itemKeywords.some(keyword => 
      lowerText.includes(keyword)
    );

    // Check for quantity indicators
    const quantityPatterns = [
      /\d+\s*(piece|pieces|pcs|pc|unit|units|pack|packs|kg|kilos|grams?|g)/i,
      /\d+\s*(dozen|dozens|dz)/i,
      /\d+\s*(bottle|bottles|can|cans|jar|jars)/i
    ];

    const hasQuantity = quantityPatterns.some(pattern => 
      pattern.test(messageText)
    );

    // Check for price indicators
    const pricePatterns = [
      /\$\d+(\.\d{2})?/,
      /₦\d+(\.\d{2})?/,
      /N\d+(\.\d{2})?/i,
      /\d+(\.\d{2})?\s*(dollars?|naira|naira|kobo)/i
    ];

    const hasPrice = pricePatterns.some(pattern => 
      pattern.test(messageText)
    );

    // Scoring system
    let score = 0;
    
    if (hasOrderKeyword) score += 3;
    if (hasAddress) score += 2;
    if (hasPhoneNumber) score += 2;
    if (hasItems) score += 2;
    if (hasQuantity) score += 1;
    if (hasPrice) score += 1;

    // Additional checks for common order patterns
    if (lowerText.includes('my name is') || lowerText.includes('i am')) score += 1;
    if (lowerText.includes('deliver to') || lowerText.includes('send to')) score += 2;
    if (lowerText.includes('total') || lowerText.includes('amount')) score += 1;

    // Minimum score to consider as order
    const minimumScore = 4;
    
    const isOrder = score >= minimumScore;
    
    if (isOrder) {
      logger.debug('Message classified as order:', {
        text: messageText.substring(0, 100),
        score,
        hasOrderKeyword,
        hasAddress,
        hasPhoneNumber,
        hasItems,
        hasQuantity,
        hasPrice
      });
    }

    return isOrder;
  }

  static extractOrderIdFromMessage(messageText) {
    if (!messageText || typeof messageText !== 'string') {
      return null;
    }

    // Look for order ID patterns
    const orderIdPatterns = [
      /(?:order\s*#?|#)\s*(\d+)/i,
      /(?:id\s*#?|#)\s*(\d+)/i,
      /(?:number\s*#?|#)\s*(\d+)/i,
      /order\s+(\d+)/i,
      /#(\d+)/,
      /order\s+id\s*:\s*(\d+)/i,
      /order\s+number\s*:\s*(\d+)/i
    ];

    for (const pattern of orderIdPatterns) {
      const match = messageText.match(pattern);
      if (match && match[1]) {
        const orderId = match[1];
        logger.debug('Extracted order ID:', { orderId, pattern: pattern.source });
        return orderId;
      }
    }

    return null;
  }

  static fallbackExtractOrderId(messageText) {
    if (!messageText || typeof messageText !== 'string') {
      return null;
    }

    // Look for any number that might be an order ID
    // This is a more aggressive approach for when the main method fails
    const numberPatterns = [
      /\b(\d{1,6})\b/g, // 1-6 digit numbers
      /\b(\d{4,8})\b/g, // 4-8 digit numbers (more likely to be order IDs)
      /\b(\d{5,7})\b/g  // 5-7 digit numbers
    ];

    for (const pattern of numberPatterns) {
      const matches = messageText.match(pattern);
      if (matches && matches.length > 0) {
        // Filter out numbers that are likely not order IDs
        const potentialOrderIds = matches.filter(match => {
          const num = parseInt(match);
          // Exclude numbers that are likely prices, quantities, or phone numbers
          if (num < 1000) return false; // Too small for order ID
          if (num > 999999) return false; // Too large for order ID
          return true;
        });

        if (potentialOrderIds.length > 0) {
          const orderId = potentialOrderIds[0]; // Take the first one
          logger.debug('Fallback extracted order ID:', { orderId, pattern: pattern.source });
          return orderId;
        }
      }
    }

    return null;
  }

  static extractCustomerInfo(messageText) {
    if (!messageText || typeof messageText !== 'string') {
      return null;
    }

    const customerInfo = {
      name: null,
      phone: null,
      address: null
    };

    // Extract name patterns
    const namePatterns = [
      /(?:my name is|i am|name:?)\s*([a-zA-Z\s]+)/i,
      /(?:customer|client):\s*([a-zA-Z\s]+)/i,
      /([a-zA-Z]+\s+[a-zA-Z]+)\s+(?:here|ordering|want)/i
    ];

    for (const pattern of namePatterns) {
      const match = messageText.match(pattern);
      if (match && match[1]) {
        customerInfo.name = match[1].trim();
        break;
      }
    }

    // Extract phone patterns
    const phonePatterns = [
      /(\+?\d{1,4}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
      /(\+234|234)?[789][01]\d{8}/,
      /(\+1)?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/
    ];

    for (const pattern of phonePatterns) {
      const match = messageText.match(pattern);
      if (match && match[0]) {
        customerInfo.phone = match[0].replace(/[-.\s]/g, '');
        break;
      }
    }

    // Extract address patterns
    const addressPatterns = [
      /(?:address|location|deliver to|send to):\s*([^.\n]+)/i,
      /(?:at|in)\s+([^.\n]+(?:street|avenue|road|drive|lane))/i,
      /(?:house|apartment|flat|building):\s*([^.\n]+)/i
    ];

    for (const pattern of addressPatterns) {
      const match = messageText.match(pattern);
      if (match && match[1]) {
        customerInfo.address = match[1].trim();
        break;
      }
    }

    return customerInfo;
  }

  static extractItems(messageText) {
    if (!messageText || typeof messageText !== 'string') {
      return [];
    }

    const items = [];
    const lines = messageText.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Look for item patterns
      const itemPatterns = [
        /^([^:]+):\s*(\d+)/i, // "Item: 2"
        /^(\d+)\s*x?\s*([^,]+)/i, // "2 x Item" or "2 Item"
        /^([^,]+)\s*-\s*(\d+)/i, // "Item - 2"
        /^([^,]+)\s*(\d+)/i // "Item 2"
      ];

      for (const pattern of itemPatterns) {
        const match = trimmedLine.match(pattern);
        if (match) {
          const quantity = parseInt(match[2] || match[1]);
          const itemName = (match[2] ? match[1] : match[2] || match[1]).trim();
          
          if (itemName && quantity) {
            items.push({
              name: itemName,
              quantity: quantity
            });
          }
          break;
        }
      }
    }

    return items;
  }

  static extractTotal(messageText) {
    if (!messageText || typeof messageText !== 'string') {
      return null;
    }

    // Look for total/amount patterns
    const totalPatterns = [
      /(?:total|amount|sum|cost):\s*\$?(\d+(?:\.\d{2})?)/i,
      /(?:total|amount|sum|cost):\s*₦?(\d+(?:\.\d{2})?)/i,
      /(?:total|amount|sum|cost):\s*N?(\d+(?:\.\d{2})?)/i,
      /\$(\d+(?:\.\d{2})?)/,
      /₦(\d+(?:\.\d{2})?)/,
      /N(\d+(?:\.\d{2})?)/i
    ];

    for (const pattern of totalPatterns) {
      const match = messageText.match(pattern);
      if (match && match[1]) {
        return parseFloat(match[1]);
      }
    }

    return null;
  }

  static formatOrderMessage(order) {
    if (!order) return '';

    let message = `📋 *Order Details*\n\n`;
    
    if (order.customer_name) {
      message += `*Customer:* ${order.customer_name}\n`;
    }
    
    if (order.customer_phone) {
      message += `*Phone:* ${order.customer_phone}\n`;
    }
    
    if (order.customer_address) {
      message += `*Address:* ${order.customer_address}\n`;
    }
    
    if (order.items) {
      message += `*Items:* ${order.items}\n`;
    }
    
    if (order.total_amount) {
      message += `*Total:* $${order.total_amount}\n`;
    }
    
    if (order.notes) {
      message += `*Notes:* ${order.notes}\n`;
    }
    
    message += `\n*Order ID:* #${order.id}`;
    
    return message;
  }

  static sanitizeMessageText(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    // Remove extra whitespace
    let sanitized = text.replace(/\s+/g, ' ').trim();
    
    // Remove common bot commands that might interfere
    const botCommands = ['/start', '/help', '/setup', '/daily', '/weekly', '/monthly'];
    for (const command of botCommands) {
      sanitized = sanitized.replace(new RegExp(command, 'gi'), '');
    }
    
    // Remove extra whitespace again
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    
    return sanitized;
  }
}

module.exports = TelegramUtils; 