const logger = require('./logger');

/**
 * Determines if a message is likely to be an order based on content analysis
 * @param {string} messageText - The message text to analyze
 * @returns {boolean} - True if the message is likely an order
 */
function isLikelyOrder(messageText) {
  try {
    const text = messageText.toLowerCase().trim();
    
    // Check for phone numbers (all possible formats) - if found, treat as likely order
    const phonePatterns = [
      // Nigerian phone numbers - all formats
      /\b(\+?234|0)[789][01]\d{8}\b/,           // +2348012345678, 08012345678
      /\b(\+?234|0)[789][01]\s*\d{8}\b/,        // +234 8012345678, 080 12345678
      /\b(\+?234|0)[789][01]-\d{8}\b/,          // +234-8012345678, 080-12345678
      /\b(\+?234|0)[789][01]\.\d{8}\b/,         // +234.8012345678, 080.12345678
      
      // 11-digit numbers - all formats
      /\b\d{11}\b/,                              // 08012345678
      /\b\d{3}\s*\d{4}\s*\d{4}\b/,              // 080 1234 5678
      /\b\d{3}-\d{4}-\d{4}\b/,                  // 080-1234-5678
      /\b\d{3}\.\d{4}\.\d{4}\b/,                // 080.1234.5678
      
      // 10-digit numbers (without country code)
      /\b\d{10}\b/,                              // 8012345678
      /\b\d{3}\s*\d{3}\s*\d{4}\b/,              // 801 234 5678
      /\b\d{3}-\d{3}-\d{4}\b/,                  // 801-234-5678
      /\b\d{3}\.\d{3}\.\d{4}\b/,                // 801.234.5678
      
      // International formats
      /\b\+\d{1,4}\s*\d{1,4}\s*\d{1,4}\s*\d{1,4}\b/,  // +1 234 567 8900
      /\b\+\d{1,4}-\d{1,4}-\d{1,4}-\d{1,4}\b/,        // +1-234-567-8900
      /\b\+\d{1,4}\.\d{1,4}\.\d{1,4}\.\d{1,4}\b/,     // +1.234.567.8900
      
             // With labels (case insensitive) - both spaced and unspaced
       /\b(phone|tel|telephone|mobile|cell|number|contact):\s*(\+?[\d\s\-\.]+)\b/i,  // phone: 08012345678
       /\b(phone|tel|telephone|mobile|cell|number|contact):(\+?[\d\s\-\.]+)\b/i,      // phone:08012345678
       /\b(phone|tel|telephone|mobile|cell|number|contact)\s*:\s*(\+?[\d\s\-\.]+)\b/i, // phone : 08012345678
       /\b(phone|tel|telephone|mobile|cell|number|contact)\s+(\+?[\d\s\-\.]+)\b/i,     // phone 08012345678
      
      // Just the word "phone" or "tel" followed by numbers
      /\b(phone|tel|telephone|mobile|cell)\s+(\+?[\d\s\-\.]+)\b/i,
      
      // Numbers that look like phone numbers (7+ digits with common separators)
      /\b\d{7,15}\b/  // Catch any 7-15 digit number that might be a phone
    ];
    
    for (const pattern of phonePatterns) {
      if (pattern.test(text)) {
        return true;
      }
    }
    
    // New: If message contains 'name'/'customer', 'phone', and 'address', always treat as likely order
    if ((text.includes('name') || text.includes('customer')) && text.includes('phone') && text.includes('address')) {
      return true;
    }
    
    // Also check for messages that start with a name (no label) and contain phone/address
    if (text.includes('phone') && text.includes('address') && text.length > 30) {
      // Check if the message starts with what looks like a name (2+ words, capitalized)
      const lines = text.split('\n');
      const firstLine = lines[0].trim();
      if (firstLine.match(/^[A-Z][a-z]+\s+[A-Z][a-z]+/)) {
        return true;
      }
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
    
         // Look for order indicators (both labeled and unlabeled formats)
     const orderIndicators = [
       // Phone numbers (Nigerian format) - strong indicator
       /\b(\+?234|0)[789][01]\d{8}\b/,
       /\b\d{11}\b/,
       
       // Customer name patterns (multiple words that could be names) - strong indicator
       /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/,
       
       // Specific order request patterns - strong indicator
       /\b(i want|i need|i would like|please order|can i order|i'd like to order|i want to order|i need to order)\b/i,
       
       // Address indicators - medium indicator (labeled and unlabeled)
       /\b(address|location|deliver to|send to|house|street|road|avenue|close|drive|way|estate|phase|area|zone)\b/i,
       /\b(address|location|deliver to|send to|house|street|road|avenue|close|drive|way|estate|phase|area|zone):\s*([^\n]+)\b/i,
       /\b(address|location|deliver to|send to|house|street|road|avenue|close|drive|way|estate|phase|area|zone):([^\n]+)\b/i,
       
       // Specific food items - medium indicator (labeled and unlabeled)
       /\b(cake|cakes|pizza|food|bread|pastry|pastries|drink|drinks|juice|water|soda)\b/i,
       /\b(items|item|food|order):\s*([^\n]+)\b/i,
       /\b(items|item|food|order):([^\n]+)\b/i,
       
       // Quantity indicators - medium indicator (labeled and unlabeled)
       /\b\d+\s*(piece|pieces|pack|packs|kg|kilos|gram|grams|litre|litres|bottle|bottles|box|boxes|dozen|dozens)\b/i,
       /\b(quantity|qty|amount|pieces|packs):\s*(\d+)\b/i,
       /\b(quantity|qty|amount|pieces|packs):(\d+)\b/i,
       
       // Price indicators - medium indicator (labeled and unlabeled)
       /\b(price|cost|amount|total|naira|₦|naira|dollar|\$|pound|£)\b/i,
       /\b(price|cost|amount|total):\s*(\d+)\b/i,
       /\b(price|cost|amount|total):(\d+)\b/i,
       
       // Delivery date/time - weak indicator (labeled and unlabeled)
       /\b(deliver|delivery|date|time|when|today|tomorrow|next)\b/i,
       /\b(delivery|deliver|date|time|when):\s*([^\n]+)\b/i,
       /\b(delivery|deliver|date|time|when):([^\n]+)\b/i
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
     
     // Medium indicators (worth 2 points each) - both labeled and unlabeled
     const mediumIndicators = [
       // Address indicators (unlabeled)
       /\b(address|location|deliver to|send to|house|street|road|avenue|close|drive|way|estate|phase|area|zone)\b/i,
       // Address indicators (labeled)
       /\b(address|location|deliver to|send to|house|street|road|avenue|close|drive|way|estate|phase|area|zone):\s*([^\n]+)\b/i,
       /\b(address|location|deliver to|send to|house|street|road|avenue|close|drive|way|estate|phase|area|zone):([^\n]+)\b/i,
       
       // Food items (unlabeled)
       /\b(cake|cakes|pizza|food|bread|pastry|pastries|drink|drinks|juice|water|soda)\b/i,
       // Food items (labeled)
       /\b(items|item|food|order):\s*([^\n]+)\b/i,
       /\b(items|item|food|order):([^\n]+)\b/i,
       
       // Quantity indicators (unlabeled)
       /\b\d+\s*(piece|pieces|pack|packs|kg|kilos|gram|grams|litre|litres|bottle|bottles|box|boxes|dozen|dozens)\b/i,
       // Quantity indicators (labeled)
       /\b(quantity|qty|amount|pieces|packs):\s*(\d+)\b/i,
       /\b(quantity|qty|amount|pieces|packs):(\d+)\b/i,
       
       // Price indicators (unlabeled)
       /\b(price|cost|amount|total|naira|₦|naira|dollar|\$|pound|£)\b/i,
       // Price indicators (labeled)
       /\b(price|cost|amount|total):\s*(\d+)\b/i,
       /\b(price|cost|amount|total):(\d+)\b/i
     ];
     
     // Weak indicators (worth 1 point each) - both labeled and unlabeled
     const weakIndicators = [
       // Delivery date/time (unlabeled)
       /\b(deliver|delivery|date|time|when|today|tomorrow|next)\b/i,
       // Delivery date/time (labeled)
       /\b(delivery|deliver|date|time|when):\s*([^\n]+)\b/i,
       /\b(delivery|deliver|date|time|when):([^\n]+)\b/i
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

module.exports = {
  isLikelyOrder
}; 