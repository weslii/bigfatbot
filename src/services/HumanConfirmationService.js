const database = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const InventoryMatchingService = require('./InventoryMatchingService');
const InventoryService = require('./InventoryService');

class HumanConfirmationService {
  constructor(coreService) {
    this.core = coreService;
    this.pendingConfirmations = new Map();
    this.pendingItemDetails = new Map();
    this.confirmationTimeout = 5 * 60 * 1000; // 5 minutes
    
    // Use the main inventory matching service
    this.matchingService = new InventoryMatchingService();
    this.inventoryService = InventoryService;
  }

  async requestItemConfirmation(item, businessId, groupId, inventory) {
    const confirmationId = uuidv4();
    
    const message = `❓ **Item Matching Required**\n\n` +
                   `*Original Item:* ${item.name} (${item.quantity})\n\n` +
                   `Please swipe to reply with what item you mean to order OR if you would like to add this item to your inventory, swipe to reply this message with *new item*\n\n` +
                   `Available items:\n${inventory.slice(0, 10).map(i => `• ${i.name} - ₦${i.price}`).join('\n')}` +
                   `${inventory.length > 10 ? `\n... and ${inventory.length - 10} more items` : ''}`;
    
    // Store pending confirmation with unique identifier
    this.pendingConfirmations.set(confirmationId, {
      confirmationId, // Add the ID to the confirmation object
      item,
      businessId,
      groupId,
      inventory,
      timestamp: Date.now()
    });
    
    // Clean up old confirmations
    this.cleanupOldConfirmations();
    
    logger.debug('Requested item confirmation', {
      confirmationId,
      itemName: item.name,
      businessId,
      groupId,
      pendingConfirmationsCount: this.pendingConfirmations.size
    });
    
    return await this.core.sendMessage(groupId, message);
  }



  async handleConfirmationResponse(message, groupId) {
    // Early return if no pending confirmations for this group
    const hasPendingConfirmations = Array.from(this.pendingConfirmations.values()).some(
      confirmation => confirmation.groupId === groupId
    );
    
    logger.debug('Checking confirmation response', {
      groupId,
      hasPendingConfirmations,
      pendingConfirmationsCount: this.pendingConfirmations.size
    });
    
    if (!hasPendingConfirmations) {
      return false;
    }
    
    // Handle both Telegram and WhatsApp message formats
    let text, replyToMessage;
    
    logger.debug('Processing message format', {
      hasText: !!message.text,
      hasReplyToMessage: !!message.reply_to_message,
      hasBody: !!message.body,
      hasQuotedMsg: !!message.hasQuotedMsg,
      text: message.text,
      body: message.body
    });
    
    if (message.text && message.reply_to_message) {
      // Telegram format
      text = message.text.toLowerCase().trim();
      replyToMessage = message.reply_to_message;
    } else if (message.body && message.hasQuotedMsg) {
      // WhatsApp format
      text = message.body.toLowerCase().trim();
      replyToMessage = message; // WhatsApp doesn't have separate reply object
    } else {
      logger.debug('Message format not supported for confirmation response');
      return false;
    }
    
    if (!replyToMessage) {
      logger.debug('No reply message found');
      return false;
    }
    
    // Find the specific confirmation being replied to
    // For now, we'll use the first confirmation found for this group
    // In a more sophisticated system, we'd match by message ID or content
    let targetConfirmation = null;
    let targetConfirmationId = null;
    
    for (const [id, confirmation] of this.pendingConfirmations.entries()) {
      if (confirmation.groupId === groupId) {
        targetConfirmation = confirmation;
        targetConfirmationId = id;
        break;
      }
    }
    
    if (!targetConfirmation) {
      logger.debug('No pending confirmation found for group', { groupId });
      return false;
    }
    
    // Check if there are multiple pending confirmations for this group
    const pendingConfirmationsForGroup = Array.from(this.pendingConfirmations.values())
      .filter(conf => conf.groupId === groupId);
    
    logger.debug('Processing confirmation response', {
      groupId,
      targetConfirmationId,
      originalItem: targetConfirmation.item.name,
      pendingConfirmationsCount: this.pendingConfirmations.size,
      confirmationsForThisGroup: pendingConfirmationsForGroup.length
    });
    
    // If there are multiple confirmations, let the user know
    if (pendingConfirmationsForGroup.length > 1) {
      logger.debug('Multiple pending confirmations detected', {
        groupId,
        count: pendingConfirmationsForGroup.length,
        items: pendingConfirmationsForGroup.map(c => c.item.name)
      });
    }
    
    if (text.includes('yes') || text.includes('confirm')) {
      // User confirmed - find best match
      const bestMatch = this.findBestMatch(targetConfirmation.item, targetConfirmation.inventory);
      if (bestMatch) {
        await this.completeMatching(targetConfirmation, bestMatch, true);
        this.pendingConfirmations.delete(targetConfirmationId);
        return true;
      }
    } else if (text.includes('no') || text.includes('wrong')) {
      // User said no - ask for correct item
      await this.requestCorrectItem(targetConfirmation);
      return true;
    } else {
      // Check if user wants to add new item
      logger.debug('Checking for new item request', { text, includesNewItem: text.includes('new item') });
      if (text.includes('new item')) {
        logger.debug('User wants to add new item', { originalItem: targetConfirmation.item.name });
        await this.promptForItemDetails({
          ...targetConfirmation,
          newItemName: targetConfirmation.item.name
        });
        // Don't delete the confirmation yet - it will be used when item details are provided
        return true;
      }
      
      // User provided different item name - use the robust inventory matching system
      logger.debug('Processing item name from user', { text, groupId });
      
      const orderData = {
        items: text,
        customer_name: 'Confirmation Response',
        customer_phone: '0000000000',
        address: 'Confirmation Response'
      };
      
      const matchingResult = await this.matchingService.matchOrderItems(orderData, targetConfirmation.businessId);
      
      logger.debug('Inventory matching result for confirmation response', {
        text,
        matchingResult: {
          status: matchingResult.status,
          matchedItemsCount: matchingResult.matchedItems.length,
          confidence: matchingResult.confidence,
          matchedItems: matchingResult.matchedItems.map(item => ({
            name: item.matchedItem?.name || item.originalItem?.name || 'Unknown',
            confidence: item.confidence,
            needsClarification: item.needsClarification
          }))
        }
      });
      
      if (matchingResult.matchedItems.length > 0) {
        // Use the first matched item
        let matchedItem = matchingResult.matchedItems[0].matchedItem;
        
        // Ensure we have the full inventory item data (name and price)
                if (!matchedItem || !matchedItem.name || !matchedItem.price) {
          logger.debug('Matched item missing name or price, fetching full inventory data', {
            matchedItemId: matchedItem?.id,
            hasName: !!matchedItem?.name,
            hasPrice: !!matchedItem?.price
          });
          
          // If matchedItem is null, we can't proceed
          if (!matchedItem) {
            logger.error('Matched item is null, cannot proceed with confirmation');
            await this.requestCorrectItem(targetConfirmation);
            return true;
          }
          
          // Fetch the full inventory item from the database
          const fullInventory = await this.inventoryService.getBusinessInventoryOptimized(targetConfirmation.businessId);
          const fullMatchedItem = fullInventory.find(item => item.id === matchedItem.id);
          
          if (fullMatchedItem) {
            matchedItem = {
              ...matchedItem,
              name: fullMatchedItem.name,
              price: fullMatchedItem.price,
              type: fullMatchedItem.type || matchedItem.type
            };
            logger.debug('Retrieved full inventory item data', {
              name: matchedItem.name,
              price: matchedItem.price,
              type: matchedItem.type
            });
          } else {
            logger.error('Could not find full inventory item data', { matchedItemId: matchedItem.id });
            await this.requestCorrectItem(targetConfirmation);
            return true;
          }
        }
        
        logger.debug('Successfully matched item', { 
          originalText: text, 
          matchedItem: matchedItem.name,
          confidence: matchingResult.matchedItems[0].confidence
        });
        await this.completeMatching(targetConfirmation, matchedItem, true);
        this.pendingConfirmations.delete(targetConfirmationId);
        return true;
      } else {
        // Item not found - ask user to specify correct item
        logger.warn('No matching item found', { text, availableItems: targetConfirmation.inventory.map(i => i.name) });
        await this.requestCorrectItem(targetConfirmation);
        return true;
      }
    }
    
    return false;
  }



  async promptForItemDetails(newItemRequest) {
    // If we already have the item name from the original order, pre-fill it
    const itemName = newItemRequest.newItemName || newItemRequest.item?.name || 'Item Name';
    
    const promptMessage = `📝 **Add New Item**\n\n` +
                         `Please provide the item details in this format:\n` +
                         `Name: Item Name\n` +
                         `Price: 1000\n` +
                         `Type: product (or "other")\n\n` +
                         `Example:\n` +
                         `Name: Chocolate Cake\n` +
                         `Price: 5000\n` +
                         `Type: product`;
    
    // Store pending item details request with unique identifier
    const itemDetailsId = uuidv4();
    this.pendingItemDetails.set(itemDetailsId, {
      ...newItemRequest,
      itemDetailsId, // Add unique identifier
      timestamp: Date.now()
    });
    
    logger.debug('Prompted for item details', {
      itemDetailsId,
      originalItem: newItemRequest.item?.name,
      groupId: newItemRequest.groupId,
      pendingItemDetailsCount: this.pendingItemDetails.size
    });
    
    await this.core.sendMessage(newItemRequest.groupId, promptMessage);
  }

  async handleItemDetailsResponse(message, groupId) {
    logger.debug('handleItemDetailsResponse called', { groupId });
    
    // Find pending item details request for this group
    let pendingItemDetails = null;
    let pendingItemDetailsId = null;
    
    // First try to find by groupId (for backward compatibility)
    for (const [id, details] of this.pendingItemDetails.entries()) {
      if (details.groupId === groupId) {
        pendingItemDetails = details;
        pendingItemDetailsId = id;
        break;
      }
    }
    
    // If not found, check if there are any pending item details for this group
    if (!pendingItemDetails) {
      logger.debug('No pending item details found for group by groupId, checking all entries', { 
        groupId,
        totalPendingItems: this.pendingItemDetails.size 
      });
      
      // Log all pending item details for debugging
      for (const [id, details] of this.pendingItemDetails.entries()) {
        logger.debug('Pending item details entry:', {
          id,
          groupId: details.groupId,
          originalItem: details.item?.name,
          timestamp: details.timestamp
        });
      }
    }
    
    if (!pendingItemDetails) {
      logger.debug('No pending item details found for group', { groupId });
      return false;
    }
    
    logger.debug('Found pending item details', {
      pendingItemDetailsId,
      originalItem: pendingItemDetails.item?.name,
      groupId
    });
    
    // Handle both Telegram and WhatsApp message formats
    let text;
    
    if (message.text) {
      // Telegram format
      text = message.text;
    } else if (message.body) {
      // WhatsApp format
      text = message.body;
    } else {
      logger.debug('No text or body found in message');
      return false;
    }
    
    logger.debug('Processing item details response', {
      text: text,
      textLength: text.length,
      groupId: groupId
    });
    
    // Parse item details from message
    const itemData = this.parseItemDetails(text);
    
    logger.debug('Parsed item details', {
      itemData: itemData,
      hasName: !!itemData.name,
      hasPrice: !!itemData.price,
      hasType: !!itemData.type,
      originalText: text
    });
    
    if (!itemData.name || !itemData.price) {
      logger.debug('Invalid item details format', { itemData, originalText: text });
      await this.core.sendMessage(groupId, 
        `❌ I couldn't understand that format. Please use:\n` +
        `Name: Item Name\n` +
        `Price: 1000\n` +
        `Type: product`
      );
      return false;
    }
    
    try {
      // Find the business ID for this group
      const group = await database.query('groups')
        .where('group_id', groupId)
        .first();
      
      if (!group) {
        await this.core.sendMessage(groupId, '❌ I couldn\'t find that group😕. Please try again.');
        return false;
      }
      
      // Add new item to inventory
      const newItem = await this.addNewItemToInventory(itemData, group.business_id);
      
      // Complete the original matching and get the updated order
      const confirmation = this.findConfirmationByGroupId(groupId);
      let updatedOrder = null;
      let updatedMatchedItems = [];
      
      if (confirmation) {
        updatedOrder = await this.completeMatching(confirmation, newItem, true, group.business_id);
        // Clean up the specific confirmation after it's used
        for (const [id, conf] of this.pendingConfirmations.entries()) {
          if (conf.groupId === groupId && conf.item.name === pendingItemDetails.item.name) {
            this.pendingConfirmations.delete(id);
            break;
          }
        }
      }
      
      // Clean up the specific pending item details
      this.pendingItemDetails.delete(pendingItemDetailsId);
      
      let feedbackMessage = `✅ **New Item Added**\n\n`;
      feedbackMessage += `*Name:* ${newItem.name}\n`;
      feedbackMessage += `*Price:* ₦${newItem.price}\n`;
      feedbackMessage += `*Type:* ${newItem.type}\n\n`;
      feedbackMessage += `Item has been added to inventory and matched to your order.\n\n`;
      
      // Only show detailed feedback if we have the updated order data
      if (updatedOrder && updatedOrder.matched_items) {
        try {
          updatedMatchedItems = typeof updatedOrder.matched_items === 'string' 
            ? JSON.parse(updatedOrder.matched_items) 
            : updatedOrder.matched_items;
          
          const itemsNeedingClarification = updatedMatchedItems.filter(item => 
            item.needsClarification || !item.matchedItem
          );
          
          const totalItems = updatedMatchedItems.length;
          const isMultiItemOrder = totalItems > 1;
          
          if (itemsNeedingClarification.length > 0) {
            // Only show detailed feedback for multi-item orders
            if (isMultiItemOrder) {
              feedbackMessage += `📋 **Remaining Items to Clarify:**\n`;
              itemsNeedingClarification.forEach((item, index) => {
                feedbackMessage += `${index + 1}. ${item.originalItem.name}\n`;
              });
              feedbackMessage += `\nPlease clarify the remaining ${itemsNeedingClarification.length} item(s) to complete your order.`;
            } else {
              // Single item order - just confirm it's complete
              feedbackMessage += `🎉 **Order Complete!**\n\nYour order will be processed shortly.`;
            }
          } else {
            // All items are complete
            if (isMultiItemOrder) {
              feedbackMessage += `🎉 **Order Complete!**\n\nAll items have been confirmed.`;
            } else {
              feedbackMessage += `🎉 **Order Complete!**\n\nYour order will be processed shortly.`;
            }
          }
        } catch (error) {
          logger.error('Error parsing matched items for new item feedback:', error);
          // Fallback to simple feedback
          feedbackMessage += `🎉 **Order Complete!**\n\nYour order will be processed shortly.`;
        }
      } else {
        // Fallback to simple feedback if no order data available
        feedbackMessage += `🎉 **Order Complete!**\n\nYour order will be processed shortly.`;
      }
      
      await this.core.sendMessage(groupId, feedbackMessage);
      
      return true;
    } catch (error) {
      logger.error('Error adding new item:', error);
      
      // Check if it's a duplicate item error
      if (error.message.includes('already exists')) {
        await this.core.sendMessage(groupId, 
          `❌ ${error.message}\n\nPlease use a different name or specify an existing item.`
        );
      } else {
        await this.core.sendMessage(groupId, 
          `❌ Error adding item to inventory. Please try again.`
        );
      }
      
      // Clean up the specific pending item details on error
      this.pendingItemDetails.delete(pendingItemDetailsId);
      return false;
    }
  }

  parseItemDetails(text) {
    const itemData = {};
    
    // Normalize text - remove extra spaces, convert to lowercase for parsing
    const normalizedText = text.toLowerCase().replace(/\s+/g, ' ').trim();
    
    // Try multiple parsing strategies
    
    // Strategy 1: Labeled format (Name: X, Price: Y, Type: Z)
    const labeledMatch = this.parseLabeledFormat(text);
    if (labeledMatch.name && labeledMatch.price) {
      return labeledMatch;
    }
    
    // Strategy 2: Unlabeled format (ItemName Price Type)
    const unlabeledMatch = this.parseUnlabeledFormat(normalizedText);
    if (unlabeledMatch.name && unlabeledMatch.price) {
      return unlabeledMatch;
    }
    
    // Strategy 3: Mixed format (try to extract from any text)
    const mixedMatch = this.parseMixedFormat(text);
    if (mixedMatch.name && mixedMatch.price) {
      return mixedMatch;
    }
    
    // If all strategies fail, return empty object
    return itemData;
  }

  parseLabeledFormat(text) {
    const lines = text.split('\n');
    const itemData = {};
    
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;
      
      const key = line.substring(0, colonIndex).trim().toLowerCase();
      const value = line.substring(colonIndex + 1).trim();
      
      if (!value) continue;
      
      switch (key) {
        case 'name':
        case 'item':
        case 'item name':
          itemData.name = value;
          break;
        case 'price':
        case 'cost':
        case 'amount':
          itemData.price = this.extractPrice(value);
          break;
        case 'type':
        case 'category':
          itemData.type = this.normalizeType(value);
          break;
      }
    }
    
    return itemData;
  }

  parseUnlabeledFormat(text) {
    // Split by common separators
    const parts = text.split(/[,\s]+/).filter(part => part.length > 0);
    
    if (parts.length < 2) return {};
    
    const itemData = {};
    
    // Try to identify price (contains numbers and currency symbols)
    const priceIndex = parts.findIndex(part => {
      const hasNumbers = /\d/.test(part);
      const hasCurrency = part.includes('₦') || part.includes('n') || part.includes('naira') || part.includes('ngn');
      const isPureNumber = /^\d+$/.test(part);
      const hasCommas = part.includes(',') && /\d/.test(part);
      
      return hasNumbers && (hasCurrency || isPureNumber || hasCommas);
    });
    
    // If we found a price with commas, we need to combine it with the next part
    if (priceIndex !== -1 && parts[priceIndex].includes(',')) {
      // Look for the next part that completes the number
      const nextPart = parts[priceIndex + 1];
      if (nextPart && /^\d+$/.test(nextPart)) {
        // Combine the parts for proper price extraction
        parts[priceIndex] = parts[priceIndex] + nextPart;
        parts.splice(priceIndex + 1, 1); // Remove the next part since we combined it
      }
    }
    
    // Try to identify type (product, other, products, others, etc.)
    const typeIndex = parts.findIndex(part => 
      ['product', 'products', 'other', 'others', 'item', 'items'].includes(part)
    );
    
          if (priceIndex !== -1) {
        // Use the full text for better price extraction
        const priceText = parts.slice(priceIndex).join(' ');
        itemData.price = this.extractPrice(priceText);
      
      // Name is everything before price, excluding type if found
      let nameParts = [];
      for (let i = 0; i < priceIndex; i++) {
        // Skip if this part is a type indicator
        if (['product', 'products', 'other', 'others', 'item', 'items'].includes(parts[i])) {
          continue;
        }
        nameParts.push(parts[i]);
      }
      itemData.name = nameParts.join(' ').trim();
      
      // Type is after price or default to 'product'
      if (typeIndex !== -1 && typeIndex > priceIndex) {
        itemData.type = this.normalizeType(parts[typeIndex]);
      } else {
        itemData.type = 'product';
      }
    }
    
    return itemData;
  }

  parseMixedFormat(text) {
    const itemData = {};
    
    // Extract price using improved method
    itemData.price = this.extractPriceFromText(text);
    
    // Extract type
    const typeMatch = text.match(/\b(product|products|other|others|item|items)\b/i);
    if (typeMatch) {
      itemData.type = this.normalizeType(typeMatch[1]);
    } else {
      itemData.type = 'product'; // Default
    }
    
    // Extract name - everything except price and type
    let nameText = text;
    
    // Remove price patterns from name
    const pricePatterns = [
      /(?:₦|n|naira)?\s*([\d,]+(?:\.\d{2})?)/i,
      /(\d{1,3}(?:,\d{3})*)/,
      /(\d+)/ // Fallback to any number
    ];
    
    for (const pattern of pricePatterns) {
      const match = nameText.match(pattern);
      if (match) {
        nameText = nameText.replace(match[0], '');
        break;
      }
    }
    
    if (typeMatch) {
      nameText = nameText.replace(typeMatch[0], '');
    }
    
    // Clean up name - remove extra words and normalize
    nameText = nameText
      .replace(/\b(and|is|a|for|costs|price|amount|naira|ngn)\b/gi, '')
      .replace(/[,\s]+/g, ' ')
      .trim();
    
    if (nameText) {
      itemData.name = nameText;
    }
    
    return itemData;
  }

  extractPrice(priceText) {
    // Remove currency symbols and spaces, but keep commas for proper parsing
    let cleanPrice = priceText.replace(/[₦n\s]/g, '');
    
    // Handle comma-separated numbers (e.g., "5,000" -> "5000")
    if (cleanPrice.includes(',')) {
      cleanPrice = cleanPrice.replace(/,/g, '');
    }
    
    // Remove any remaining non-numeric characters except decimal point
    cleanPrice = cleanPrice.replace(/[^\d.]/g, '');
    
    const price = parseFloat(cleanPrice);
    return isNaN(price) ? 0 : price;
  }

  // Helper method to extract price from text with better comma handling
  extractPriceFromText(text) {
    // Try to find price patterns in the text
    const patterns = [
      /(?:₦|n|naira)?\s*([\d,]+(?:\.\d{2})?)/i,
      /(\d{1,3}(?:,\d{3})*)/,
      /(\d+)/ // Fallback to any number
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const price = this.extractPrice(match[0]);
        if (price > 0) {
          return price;
        }
      }
    }
    
    return 0;
  }

  normalizeType(typeText) {
    const normalized = typeText.toLowerCase().trim();
    
    // Handle various type inputs
    if (['product', 'products', 'item', 'items'].includes(normalized)) {
      return 'product';
    } else if (['other', 'others', 'service', 'services'].includes(normalized)) {
      return 'other';
    } else {
      return 'product'; // Default to product
    }
  }

  async addNewItemToInventory(itemData, businessId) {
    const { name, price, type } = itemData;
    
    try {
      // Ensure businessId is a valid UUID
      if (!businessId || typeof businessId !== 'string' || businessId.length !== 36) {
        throw new Error('Invalid business ID format');
      }
      
      // Check for existing items with the same name (case-insensitive)
      const existingProduct = await database.query('products')
        .where('business_id', businessId)
        .whereRaw('LOWER(name) = ?', [name.trim().toLowerCase()])
        .first();
        
      const existingOther = await database.query('others')
        .where('business_id', businessId)
        .whereRaw('LOWER(name) = ?', [name.trim().toLowerCase()])
        .first();
      
      if (existingProduct || existingOther) {
        const existingItem = existingProduct || existingOther;
        throw new Error(`Item "${name}" already exists in your inventory with price ₦${existingItem.price}`);
      }
      
      if (type === 'product') {
        const [product] = await database.query('products').insert({
          business_id: businessId,
          name: name.trim(),
          price: parseFloat(price),
          stock_count: 0
        }).returning('*');
        
        return { ...product, type: 'product' };
      } else {
        const [other] = await database.query('others').insert({
          business_id: businessId,
          name: name.trim(),
          price: parseFloat(price)
        }).returning('*');
        
        return { ...other, type: 'other' };
      }
    } catch (error) {
      logger.error('Error adding new item:', error);
      throw error;
    }
  }

  async requestCorrectItem(confirmation) {
    const message = `❓ **Item Clarification**\n\n` +
                   `*Original Item:* ${confirmation.item.name}\n\n` +
                   `Please specify the correct item name from the inventory, or reply with a new item name.`;
    
    await this.core.sendMessage(confirmation.groupId, message);
  }

  findBestMatch(item, inventory) {
    // Simple exact match first
    const exactMatch = inventory.find(i => 
      i.name.toLowerCase() === item.name.toLowerCase()
    );
    
    if (exactMatch) return exactMatch;
    
    // Partial match
    const partialMatch = inventory.find(i => 
      i.name.toLowerCase().includes(item.name.toLowerCase()) ||
      item.name.toLowerCase().includes(i.name.toLowerCase())
    );
    
    return partialMatch;
  }

  async completeMatching(confirmation, matchedItem, userConfirmed, businessId = null) {
    try {
          logger.debug('completeMatching called', {
      businessId: businessId || confirmation.businessId,
      originalItem: confirmation.item.name,
      matchedItem: matchedItem.name
    });
      
      // Record the match result for learning
      await this.recordMatchResult(
        confirmation.businessId,
        confirmation.item.name,
        matchedItem.id,
        matchedItem.type,
        userConfirmed,
        0.8 // Default confidence for user-confirmed matches
      );
      
            // Update the order with the matched item
      const updatedOrder = await this.updateOrderWithMatchedItem(confirmation, matchedItem);
      
      // Send confirmation messages only if the order is actually completed
      if (updatedOrder && updatedOrder.matching_status === 'completed') {
        logger.debug('Order completed, sending confirmation messages', {
          orderId: updatedOrder.order_id,
          matchingStatus: updatedOrder.matching_status
        });
        await this.sendOrderConfirmationsWithOrder(updatedOrder);
      } else if (updatedOrder) {
        logger.debug('Order not yet completed, skipping confirmation messages', {
          orderId: updatedOrder.order_id,
          matchingStatus: updatedOrder.matching_status
        });
        
        // Get the updated matched items from the order
        let updatedMatchedItems = [];
        try {
          if (updatedOrder.matched_items) {
            updatedMatchedItems = typeof updatedOrder.matched_items === 'string' 
              ? JSON.parse(updatedOrder.matched_items) 
              : updatedOrder.matched_items;
          }
        } catch (error) {
          logger.error('Error parsing updated matched items for feedback:', error);
          return updatedOrder; // Return the order even if parsing fails
        }
        
        // Send feedback about the clarification and remaining items
        await this.sendClarificationFeedback(updatedOrder, confirmation, updatedMatchedItems);
      }
      
      // Return the updated order for use in feedback
      return updatedOrder;
      
      logger.debug('Completed item matching', {
        originalItem: confirmation.item.name,
        matchedItem: matchedItem.name,
        userConfirmed
      });
      
    } catch (error) {
      logger.error('Error completing matching:', error);
    }
  }

  async updateOrderWithMatchedItem(confirmation, matchedItem) {
    try {
      // Debug: Log the matchedItem object
      logger.debug('updateOrderWithMatchedItem called with:', {
        matchedItem: matchedItem,
        matchedItemKeys: Object.keys(matchedItem || {}),
        matchedItemName: matchedItem?.name,
        matchedItemId: matchedItem?.id
      });
      
      // Find the order that needs to be updated
      const order = await database.query('orders')
        .where('business_id', confirmation.businessId)
        .whereIn('matching_status', ['needs_clarification', 'needs_confirmation'])
        .orderBy('created_at', 'desc')
        .first();
      
      if (!order) {
        logger.error('No order found for clarification update', {
          businessId: confirmation.businessId
        });
        return;
      }
      
      // Ensure matchedItem has all required properties
      if (!matchedItem || !matchedItem.id || !matchedItem.name || !matchedItem.price) {
        logger.error('Invalid matchedItem object:', {
          matchedItem,
          hasId: !!matchedItem?.id,
          hasName: !!matchedItem?.name,
          hasPrice: !!matchedItem?.price
        });
        return;
      }
      
      // Get existing matched items from the order
      let existingMatchedItems = [];
      try {
        if (order.matched_items) {
          existingMatchedItems = typeof order.matched_items === 'string' 
            ? JSON.parse(order.matched_items) 
            : order.matched_items;
        }
      } catch (error) {
        logger.error('Error parsing existing matched items:', error);
        existingMatchedItems = [];
      }
      
      logger.debug('Existing matched items from order:', {
        orderId: order.order_id,
        existingMatchedItemsCount: existingMatchedItems.length,
        existingMatchedItems: existingMatchedItems.map(item => ({
          originalItem: item.originalItem?.name,
          matchedItem: item.matchedItem?.name,
          confidence: item.confidence,
          needsClarification: item.needsClarification
        }))
      });

      // Create the new matched item
      const newMatchedItem = {
        originalItem: confirmation.item,
        matchedItem: {
          id: matchedItem.id,
          name: matchedItem.name,
          price: matchedItem.price,
          type: matchedItem.type || 'product'
        },
        quantity: confirmation.item.quantity,
        unitPrice: parseFloat(matchedItem.price),
        totalPrice: parseFloat(matchedItem.price) * confirmation.item.quantity,
        confidence: 1.0, // High confidence for user-confirmed matches
        type: matchedItem.type || 'product'
      };

      // Add the new item to existing items, or replace if it's the same original item
      const updatedMatchedItems = [];
      let itemReplaced = false;

      logger.debug('Processing existing matched items for replacement', {
        confirmationItemName: confirmation.item.name,
        existingItemsCount: existingMatchedItems.length,
        existingItems: existingMatchedItems.map(item => ({
          originalItemName: item.originalItem?.name,
          matchedItemName: item.matchedItem?.name,
          needsClarification: item.needsClarification
        }))
      });

      for (const existingItem of existingMatchedItems) {
        if (existingItem.originalItem.name === confirmation.item.name) {
          // Replace this item with the new confirmed item
          logger.debug('Replacing existing item with confirmed item', {
            originalItemName: existingItem.originalItem.name,
            newMatchedItemName: newMatchedItem.matchedItem.name
          });
          updatedMatchedItems.push(newMatchedItem);
          itemReplaced = true;
        } else {
          // Keep this existing item
          logger.debug('Keeping existing item', {
            originalItemName: existingItem.originalItem.name,
            matchedItemName: existingItem.matchedItem?.name
          });
          updatedMatchedItems.push(existingItem);
        }
      }

      // If no existing item was replaced, add the new item
      if (!itemReplaced) {
        updatedMatchedItems.push(newMatchedItem);
      }

      const matchedItems = updatedMatchedItems;
      
      logger.debug('Created matched items structure:', {
        matchedItemsCount: matchedItems.length,
        matchedItems: matchedItems.map(item => ({
          originalItem: item.originalItem?.name,
          matchedItem: item.matchedItem?.name,
          confidence: item.confidence,
          needsClarification: item.needsClarification
        })),
        firstItem: matchedItems[0],
        firstItemKeys: Object.keys(matchedItems[0] || {}),
        matchedItemKeys: Object.keys(matchedItems[0]?.matchedItem || {}),
        matchedItemName: matchedItems[0]?.matchedItem?.name
      });
      
      // Calculate total revenue from all matched items
      const totalRevenue = matchedItems.reduce((sum, item) => sum + item.totalPrice, 0);
      
      // Check if all items are now matched (confidence > 0.8 and no items need clarification)
      const allItemsMatched = matchedItems.every(item => 
        item.confidence > 0.8 && !item.needsClarification
      );
      const matchingStatus = allItemsMatched ? 'completed' : 'needs_confirmation';
      
      logger.debug('Order completion check:', {
        totalItems: matchedItems.length,
        allItemsMatched,
        itemsStatus: matchedItems.map(item => ({
          name: item.originalItem?.name,
          confidence: item.confidence,
          needsClarification: item.needsClarification,
          isComplete: item.confidence > 0.8 && !item.needsClarification
        }))
      });
      
      // Update the order
      await database.query('orders')
        .where('id', order.id)
        .update({
          matched_items: JSON.stringify(matchedItems),
          total_revenue: totalRevenue,
          matching_confidence: 1.0,
          matching_status: matchingStatus,
          updated_at: database.query.fn.now()
        });
      
      // Get the updated order
      const updatedOrder = await database.query('orders')
        .where('id', order.id)
        .first();
      
      // Reduce stock count for all matched products when order is completed
      if (matchingStatus === 'completed') {
        for (const item of matchedItems) {
          if (item.matchedItem.type === 'product') {
            try {
              await InventoryService.updateStock(
                item.matchedItem.id, 
                confirmation.businessId, 
                -item.quantity
              );
              logger.debug('Stock reduced for product', {
                productId: item.matchedItem.id,
                productName: item.matchedItem.name,
                quantityReduced: item.quantity,
                businessId: confirmation.businessId
              });
            } catch (error) {
              logger.error('Error reducing stock for product:', error);
              // Don't fail the order completion if stock reduction fails
            }
          }
        }
      }
      
      logger.debug('Order updated with matched item', {
        orderId: order.order_id,
        businessId: confirmation.businessId,
        originalItem: confirmation.item.name,
        matchedItem: matchedItem.name,
        matchedItemDetails: {
          id: matchedItem.id,
          name: matchedItem.name,
          price: matchedItem.price,
          type: matchedItem.type
        },
        quantity: confirmation.item.quantity
      });
      
      return updatedOrder; // Return the updated order
      
    } catch (error) {
      logger.error('Error updating order with matched item:', error);
      return null; // Return null on error
    }
  }

  async recordMatchResult(businessId, originalText, matchedItemId, matchedItemType, userConfirmed, confidenceScore) {
    try {
      // Ensure all parameters are valid
      if (!businessId || !originalText || !matchedItemId || !matchedItemType) {
        logger.warn('Invalid parameters for recording match result', {
          businessId, originalText, matchedItemId, matchedItemType
        });
        return;
      }
      
      await database.query('matching_learning_data').insert({
        business_id: businessId,
        original_text: originalText,
        matched_item_id: matchedItemId,
        matched_item_type: matchedItemType,
        user_confirmed: userConfirmed,
        confidence_score: confidenceScore,
        created_at: new Date()
      });
    } catch (error) {
      logger.error('Error recording match result:', error);
    }
  }

  findConfirmationByGroupId(groupId) {
    for (const [id, confirmation] of this.pendingConfirmations.entries()) {
      if (confirmation.groupId === groupId) {
        return confirmation;
      }
    }
    return null;
  }

  cleanupOldConfirmations() {
    const now = Date.now();
    
    // Clean up old confirmations
    for (const [id, confirmation] of this.pendingConfirmations.entries()) {
      if (now - confirmation.timestamp > this.confirmationTimeout) {
        this.pendingConfirmations.delete(id);
        logger.debug('Cleaned up expired confirmation', { id });
      }
    }
    
    // Clean up old item details requests
    for (const [id, itemDetails] of this.pendingItemDetails.entries()) {
      if (now - itemDetails.timestamp > this.confirmationTimeout) {
        this.pendingItemDetails.delete(id);
        logger.debug('Cleaned up expired item details request', { id, groupId: itemDetails.groupId });
      }
    }
  }





  getPendingConfirmationsCount() {
    return `${this.pendingConfirmations.size} confirmations, ${this.pendingItemDetails.size} item details`;
  }

  async sendOrderConfirmations(businessId) {
    try {
      logger.debug('sendOrderConfirmations called', { businessId });
      
      // Get the most recent completed order for this business
      const order = await database.query('orders')
        .where('business_id', businessId)
        .where('matching_status', 'completed')
        .orderBy('updated_at', 'desc')
        .first();
      
      if (!order) {
        logger.error('No completed order found for confirmation messages', { businessId });
        return;
      }
      
      const MessageService = require('./MessageService');
      const deliveryConfirmation = MessageService.formatOrderConfirmation(order);
      const salesConfirmation = MessageService.formatSalesConfirmation(order);
      
      // Send to delivery group
      const deliveryGroup = await database.query('groups')
        .where('business_id', businessId)
        .where('group_type', 'delivery')
        .first();
      
      if (deliveryGroup) {
        await this.core.sendMessage(deliveryGroup.group_id, deliveryConfirmation);
        logger.debug('Sent delivery confirmation message');
      }
      
      // Send to sales group
      const salesGroup = await database.query('groups')
        .where('business_id', businessId)
        .where('group_type', 'sales')
        .first();
      
      if (salesGroup) {
        await this.core.sendMessage(salesGroup.group_id, salesConfirmation);
        logger.debug('Sent sales confirmation message');
      }
      
      logger.debug('Sent order confirmation messages after clarification', {
        orderId: order.order_id,
        businessId
      });
      
    } catch (error) {
      logger.error('Error sending order confirmations after clarification:', error);
    }
  }

  async sendClarificationFeedback(order, confirmation, matchedItems) {
    try {
      logger.debug('sendClarificationFeedback called', {
        orderId: order.order_id,
        confirmedItem: confirmation.item.name,
        totalItems: matchedItems.length
      });
      
      // Use the passed matchedItems (from the current order update)
      if (!matchedItems || !Array.isArray(matchedItems)) {
        logger.error('Invalid matchedItems passed to sendClarificationFeedback:', matchedItems);
        return;
      }
      
      // Count items that still need clarification
      const itemsNeedingClarification = matchedItems.filter(item => 
        item.needsClarification || !item.matchedItem
      );
      
      // Count completed items
      const completedItems = matchedItems.filter(item => 
        item.confidence > 0.8 && !item.needsClarification
      );
      
      logger.debug('Clarification feedback analysis:', {
        totalItems: matchedItems.length,
        completedItems: completedItems.length,
        itemsNeedingClarification: itemsNeedingClarification.length,
        itemsNeedingClarificationNames: itemsNeedingClarification.map(item => item.originalItem?.name)
      });
      
      // Create feedback message based on whether this is a multi-item order
      const totalItems = matchedItems.length;
      const isMultiItemOrder = totalItems > 1;
      
      let feedbackMessage = `✅ **Item Confirmed**\n\n`;
      feedbackMessage += `*${confirmation.item.name}* has been confirmed and added to your order.\n\n`;
      
      if (itemsNeedingClarification.length > 0) {
        // Only show detailed feedback for multi-item orders
        if (isMultiItemOrder) {
          feedbackMessage += `📋 **Remaining Items to Clarify:**\n`;
          itemsNeedingClarification.forEach((item, index) => {
            feedbackMessage += `${index + 1}. ${item.originalItem.name}\n`;
          });
          feedbackMessage += `\nPlease clarify the remaining ${itemsNeedingClarification.length} item(s) to complete your order.`;
        } else {
          // Single item order - just confirm it's complete
          feedbackMessage += `🎉 **Order Complete!**\n\nYour order will be processed shortly.`;
        }
      } else {
        // All items are complete
        if (isMultiItemOrder) {
          feedbackMessage += `🎉 **Order Complete!**\n\nAll items have been confirmed.`;
        } else {
          feedbackMessage += `🎉 **Order Complete!**\n\nYour order will be processed shortly.`;
        }
      }
      
      // Send feedback to the sales group
      const salesGroup = await database.query('groups')
        .where('business_id', order.business_id)
        .where('group_type', 'sales')
        .first();
      
      if (salesGroup) {
        await this.core.sendMessage(salesGroup.group_id, feedbackMessage);
        logger.debug('Sent clarification feedback message');
      }
      
    } catch (error) {
      logger.error('Error sending clarification feedback:', error);
    }
  }

  async sendOrderConfirmationsWithOrder(order) {
    try {
      logger.debug('sendOrderConfirmationsWithOrder called', { 
        orderId: order.order_id,
        matchingStatus: order.matching_status
      });
      
      // Only send confirmations if the order is actually completed
      if (order.matching_status !== 'completed') {
        logger.debug('Skipping confirmation messages - order not completed yet', {
          orderId: order.order_id,
          matchingStatus: order.matching_status
        });
        return;
      }
      
      const MessageService = require('./MessageService');
      const deliveryConfirmation = MessageService.formatOrderConfirmation(order);
      const salesConfirmation = MessageService.formatSalesConfirmation(order);
      
      // Send to delivery group
      const deliveryGroup = await database.query('groups')
        .where('business_id', order.business_id)
        .where('group_type', 'delivery')
        .first();
      
      if (deliveryGroup) {
        await this.core.sendMessage(deliveryGroup.group_id, deliveryConfirmation);
        logger.debug('Sent delivery confirmation message for order');
      }
      
      // Send to sales group
      const salesGroup = await database.query('groups')
        .where('business_id', order.business_id)
        .where('group_type', 'sales')
        .first();
      
      if (salesGroup) {
        await this.core.sendMessage(salesGroup.group_id, salesConfirmation);
        logger.debug('Sent sales confirmation message for order');
      }
      
      logger.debug('Sent order confirmation messages after clarification for order', {
        orderId: order.order_id,
        businessId: order.business_id
      });
      
    } catch (error) {
      logger.error('Error sending order confirmations after clarification for order:', error);
    }
  }
}

module.exports = HumanConfirmationService; 