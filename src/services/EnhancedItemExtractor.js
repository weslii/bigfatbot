const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class EnhancedItemExtractor {
  static extractItemsWithQuantities(itemsText) {
    if (!itemsText || typeof itemsText !== 'string' || itemsText.trim() === '') {
      return [];
    }

    const items = [];
    const text = itemsText.trim();
    
    // First, try to split by common conjunctions and separators
    const splitPatterns = [
      /\s+and\s+/i,
      /\s*,\s*/,
      /\s*;\s*/,
      /\s*\|\s*/
    ];
    
    let itemParts = [text];
    for (const pattern of splitPatterns) {
      if (itemParts.length === 1) {
        itemParts = itemParts[0].split(pattern);
      }
    }
    
    // Process each part
    for (const part of itemParts) {
      const trimmedPart = part.trim();
      if (!trimmedPart) continue;
      
      // Multiple patterns for different formats
      const patterns = [
        { regex: /(\d+)\s+([A-Za-z\s]+)/g, quantityIndex: 1, nameIndex: 2 },
        { regex: /([A-Za-z\s]+)\s*x\s*(\d+)/gi, quantityIndex: 2, nameIndex: 1 },
        { regex: /(\d+)x\s+([A-Za-z\s]+)/gi, quantityIndex: 1, nameIndex: 2 },
        { regex: /([A-Za-z\s]+)\s+(\d+)/g, quantityIndex: 2, nameIndex: 1 }
      ];
      
      let partMatched = false;
      for (const pattern of patterns) {
        const matches = trimmedPart.matchAll(pattern.regex);
        for (const match of matches) {
          const name = match[pattern.nameIndex].trim();
          const quantity = parseInt(match[pattern.quantityIndex]);
          
          if (name && quantity > 0) {
            items.push({
              id: uuidv4(),
              name: name,
              quantity: quantity,
              originalText: match[0]
            });
            partMatched = true;
          }
        }
        if (partMatched) break;
      }
      
      // If no patterns matched for this part, treat as single item with quantity 1
      if (!partMatched && trimmedPart.length > 0) {
        items.push({
          id: uuidv4(),
          name: trimmedPart,
          quantity: 1,
          originalText: trimmedPart
        });
      }
    }
    
    // Remove duplicates and merge quantities for same items
    const mergedItems = this.mergeDuplicateItems(items);
    
    logger.info('Extracted items from order text', {
      originalText: itemsText,
      extractedItems: mergedItems.map(item => `${item.quantity}x ${item.name}`)
    });
    
    return mergedItems;
  }

  static mergeDuplicateItems(items) {
    const itemMap = new Map();
    
    for (const item of items) {
      const normalizedName = item.name.toLowerCase().trim();
      
      if (itemMap.has(normalizedName)) {
        const existing = itemMap.get(normalizedName);
        existing.quantity += item.quantity;
      } else {
        itemMap.set(normalizedName, {
          ...item,
          name: item.name.trim() // Keep original case
        });
      }
    }
    
    return Array.from(itemMap.values());
  }

  static extractQuantity(text) {
    if (!text) return 1;
    
    // Look for quantity patterns
    const quantityPatterns = [
      /(\d+)\s*$/,
      /^(\d+)\s*/,
      /(\d+)\s*x\s*/i,
      /x\s*(\d+)/i
    ];
    
    for (const pattern of quantityPatterns) {
      const match = text.match(pattern);
      if (match) {
        const quantity = parseInt(match[1]);
        if (quantity > 0) {
          return quantity;
        }
      }
    }
    
    return 1; // Default quantity
  }

  static normalizeItemName(name) {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[^\w\s]/g, ''); // Remove special characters except spaces
  }
}

module.exports = EnhancedItemExtractor; 