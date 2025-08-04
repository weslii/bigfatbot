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
                   `Please swipe to reply and specify what item you'd like to order OR if you would like to add this item to your inventory, swipe to reply this message with *new item*\n\n` +
                   `Available items:\n${inventory.slice(0, 10).map(i => `• ${i.name} - ₦${i.price}`).join('\n')}` +
                   `${inventory.length > 10 ? `\n... and ${inventory.length - 10} more items` : ''}`;
    
    // Store pending confirmation
    this.pendingConfirmations.set(confirmationId, {
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
      groupId
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
    
    // Find pending confirmation
    for (const [id, confirmation] of this.pendingConfirmations.entries()) {
      if (confirmation.groupId === groupId) {
        if (text.includes('yes') || text.includes('confirm')) {
          // User confirmed - find best match
          const bestMatch = this.findBestMatch(confirmation.item, confirmation.inventory);
          if (bestMatch) {
            await this.completeMatching(confirmation, bestMatch, true);
            this.pendingConfirmations.delete(id);
            return true;
          }
        } else if (text.includes('no') || text.includes('wrong')) {
          // User said no - ask for correct item
          await this.requestCorrectItem(confirmation);
          return true;
        } else {
          // Check if user wants to add new item
          logger.debug('Checking for new item request', { text, includesNewItem: text.includes('new item') });
          if (text.includes('new item')) {
            logger.debug('User wants to add new item', { originalItem: confirmation.item.name });
            await this.promptForItemDetails({
              ...confirmation,
              newItemName: confirmation.item.name
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
          
          const matchingResult = await this.matchingService.matchOrderItems(orderData, confirmation.businessId);
          
          logger.debug('Inventory matching result for confirmation response', {
            text,
            matchingResult: {
              status: matchingResult.status,
              matchedItemsCount: matchingResult.matchedItems.length,
              confidence: matchingResult.confidence,
              matchedItems: matchingResult.matchedItems.map(item => ({
                name: item.matchedItem.name,
                confidence: item.confidence
              }))
            }
          });
          
          if (matchingResult.matchedItems.length > 0) {
            // Use the first matched item
            let matchedItem = matchingResult.matchedItems[0].matchedItem;
            
            // Ensure we have the full inventory item data (name and price)
            if (!matchedItem.name || !matchedItem.price) {
              logger.debug('Matched item missing name or price, fetching full inventory data', {
                matchedItemId: matchedItem.id,
                hasName: !!matchedItem.name,
                hasPrice: !!matchedItem.price
              });
              
              // Fetch the full inventory item from the database
              const fullInventory = await this.inventoryService.getBusinessInventoryOptimized(confirmation.businessId);
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
                await this.requestCorrectItem(confirmation);
                return true;
              }
            }
            
            logger.debug('Successfully matched item', { 
              originalText: text, 
              matchedItem: matchedItem.name,
              confidence: matchingResult.matchedItems[0].confidence
            });
            await this.completeMatching(confirmation, matchedItem, true);
            this.pendingConfirmations.delete(id);
            return true;
          } else {
            // Item not found - ask user to specify correct item
            logger.warn('No matching item found', { text, availableItems: confirmation.inventory.map(i => i.name) });
            await this.requestCorrectItem(confirmation);
            return true;
          }
        }
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
    
    // Store pending item details request
    this.pendingItemDetails.set(newItemRequest.groupId, {
      ...newItemRequest,
      timestamp: Date.now()
    });
    
    await this.core.sendMessage(newItemRequest.groupId, promptMessage);
  }

  async handleItemDetailsResponse(message, groupId) {
    logger.debug('handleItemDetailsResponse called', { groupId });
    
    // Early return if no pending item details request for this group
    const pendingItemDetails = this.pendingItemDetails.get(groupId);
    
    if (!pendingItemDetails) {
      logger.debug('No pending item details found for group', { groupId });
      return false;
    }
    
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
    
    // Parse item details from message
    const itemData = this.parseItemDetails(text);
    
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
      
      // Complete the original matching
      const confirmation = this.findConfirmationByGroupId(groupId);
      if (confirmation) {
        await this.completeMatching(confirmation, newItem, true, group.business_id);
        // Clean up the confirmation after it's used
        for (const [id, conf] of this.pendingConfirmations.entries()) {
          if (conf.groupId === groupId) {
            this.pendingConfirmations.delete(id);
            break;
          }
        }
      }
      
      // Clean up pending item details
      this.pendingItemDetails.delete(groupId);
      
      await this.core.sendMessage(groupId, 
        `✅ **New Item Added**\n\n` +
        `*Name:* ${newItem.name}\n` +
        `*Price:* ₦${newItem.price}\n` +
        `*Type:* ${newItem.type}\n\n` +
        `Item has been added to inventory and matched to your order.`
      );
      
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
      
      // Clean up pending item details on error
      this.pendingItemDetails.delete(groupId);
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
      
      // Send confirmation messages to groups using the updated order
      if (updatedOrder) {
        await this.sendOrderConfirmationsWithOrder(updatedOrder);
      }
      
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
        .where('matching_status', 'needs_clarification')
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
      
      // Create matched items array with correct structure
      const matchedItems = [{
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
      }];
      
      logger.debug('Created matched items structure:', {
        matchedItems,
        firstItem: matchedItems[0],
        firstItemKeys: Object.keys(matchedItems[0] || {}),
        matchedItemKeys: Object.keys(matchedItems[0]?.matchedItem || {}),
        matchedItemName: matchedItems[0]?.matchedItem?.name
      });
      
      // Update the order
      await database.query('orders')
        .where('id', order.id)
        .update({
          matched_items: JSON.stringify(matchedItems),
          total_revenue: parseFloat(matchedItem.price) * confirmation.item.quantity,
          matching_confidence: 1.0,
          matching_status: 'completed',
          updated_at: database.query.fn.now()
        });
      
      // Get the updated order
      const updatedOrder = await database.query('orders')
        .where('id', order.id)
        .first();
      
      // Reduce stock count for products (not for 'other' items)
      if (matchedItem.type === 'product') {
        try {
          await InventoryService.updateStock(matchedItem.id, confirmation.businessId, -confirmation.item.quantity);
                logger.debug('Stock reduced for product', {
        productId: matchedItem.id,
        productName: matchedItem.name,
        quantityReduced: confirmation.item.quantity,
        businessId: confirmation.businessId
      });
        } catch (error) {
          logger.error('Error reducing stock for product:', error);
          // Don't fail the order completion if stock reduction fails
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
    for (const [groupId, itemDetails] of this.pendingItemDetails.entries()) {
      if (now - itemDetails.timestamp > this.confirmationTimeout) {
        this.pendingItemDetails.delete(groupId);
        logger.debug('Cleaned up expired item details request', { groupId });
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

  async sendOrderConfirmationsWithOrder(order) {
    try {
      logger.debug('sendOrderConfirmationsWithOrder called', { orderId: order.order_id });
      
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