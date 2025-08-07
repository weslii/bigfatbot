const Fuse = require('fuse.js');
const { parseOrderWithAI, matchItemWithAI } = require('./AIPoweredOrderParser');
const EnhancedItemExtractor = require('./EnhancedItemExtractor');
const MemoryOptimizedInventoryService = require('./MemoryOptimizedInventoryService');
const AdaptiveConfidenceService = require('./AdaptiveConfidenceService');
const inventoryMemoryMonitor = require('../utils/inventoryMemoryMonitor');
const database = require('../config/database');
const logger = require('../utils/logger');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

class InventoryMatchingService {
  constructor() {
    this.inventoryService = new MemoryOptimizedInventoryService();
    this.confidenceService = new AdaptiveConfidenceService();
    this.fuseOptions = {
      threshold: 0.1, // Much stricter threshold for fuzzy matching
      keys: ['name'],
      includeScore: true,
      minMatchCharLength: 3 // Require longer matches
    };
  }

  async matchOrderItems(orderData, businessId) {
    try {
      // Log memory usage at start
      inventoryMemoryMonitor.logMemoryUsage('matchOrderItems-start');
      
      // Extract items from order
      logger.debug('Extracting items from order data', {
        items: orderData.items,
        itemsType: typeof orderData.items,
        businessId
      });
      
      let extractedItems;
      if (Array.isArray(orderData.items)) {
        // Handle array format from AI parser
        extractedItems = orderData.items.map(item => ({
          id: uuidv4(),
          name: item,
          quantity: 1,
          originalText: item
        }));
        logger.debug('Extracted items from array format', {
          extractedItemsCount: extractedItems.length,
          extractedItems: extractedItems.map(item => `${item.quantity}x ${item.name}`)
        });
      } else {
        // Handle string format
        extractedItems = EnhancedItemExtractor.extractItemsWithQuantities(orderData.items);
        logger.debug('Extracted items from string format', {
          extractedItemsCount: extractedItems.length,
          extractedItems: extractedItems.map(item => `${item.quantity}x ${item.name}`)
        });
      }
      
      logger.debug('Extracted items result', {
        extractedItemsCount: extractedItems.length,
        extractedItems: extractedItems.map(item => `${item.quantity}x ${item.name}`)
      });
      
      if (extractedItems.length === 0) {
        return this.handleNoItemsCase(orderData, businessId);
      }

      // Get business inventory
      const inventory = await this.inventoryService.getBusinessInventoryOptimized(businessId);
      
      if (inventory.length === 0) {
        return { 
          matchedItems: [], 
          totalRevenue: 0, 
          confidence: 0, 
          status: 'no_inventory' 
        };
      }

      // Match each item
      const matchedItems = [];
      let totalRevenue = 0;
      let needsHumanConfirmation = false;

      for (const item of extractedItems) {
        const match = await this.matchSingleItem(item, inventory, businessId);
        
        if (match) {
          // This is a real match
          matchedItems.push(match);
          totalRevenue += match.totalPrice;
          
          if (match.confidence < 0.65) {
            needsHumanConfirmation = true;
          }
        } else {
          // No match found - needs clarification
          // Create a placeholder match for items that need clarification
          const clarificationItem = {
            originalItem: item,
            matchedItem: null,
            quantity: item.quantity,
            unitPrice: 0,
            totalPrice: 0,
            confidence: 0,
            type: 'product',
            needsClarification: true
          };
          matchedItems.push(clarificationItem);
          needsHumanConfirmation = true;
        }
      }

      const confidence = this.calculateOverallConfidence(matchedItems);
      
      // Log memory usage at end
      inventoryMemoryMonitor.logMemoryUsage('matchOrderItems-end');
      
      // Determine the correct status
      let status;
      if (matchedItems.length === 0 && needsHumanConfirmation) {
        status = 'needs_clarification';
      } else if (needsHumanConfirmation) {
        status = 'needs_confirmation';
      } else {
        status = 'completed';
      }
      
      return {
        matchedItems,
        totalRevenue,
        confidence,
        status,
        inventory // Include for confirmation service
      };
    } catch (error) {
      logger.error('Error in matchOrderItems:', error);
      return {
        matchedItems: [],
        totalRevenue: 0,
        confidence: 0,
        status: 'error',
        error: error.message
      };
    }
  }

  async matchSingleItem(item, inventory, businessId) {
    const thresholds = await this.confidenceService.getAdaptiveThresholds(businessId);
    
    // 1. Check cache first
    const cachedMatch = await this.checkCache(item, businessId);
    if (cachedMatch && cachedMatch.confidence >= thresholds.autoAccept) {
      return this.createMatchResult(item, cachedMatch, cachedMatch.confidence);
    }

    // 2. Fuzzy matching
    const fuse = new Fuse(inventory, this.fuseOptions);
    const fuzzyResults = fuse.search(item.name);
    
    if (fuzzyResults.length > 0) {
      const bestFuzzyMatch = fuzzyResults[0];
      const fuzzyScore = 1 - bestFuzzyMatch.score; // Convert to confidence score
      
      if (fuzzyScore >= thresholds.autoAccept) {
        const match = this.createMatchResult(item, bestFuzzyMatch.item, fuzzyScore);
        await this.cacheMatch(item, match, businessId);
        return match;
      }
    }

    // 3. AI-powered matching
    const aiMatch = await this.aiMatch(item, inventory);
    
    if (aiMatch && aiMatch.confidence >= thresholds.aiRequired) {
      const match = this.createMatchResult(item, aiMatch.item, aiMatch.confidence);
      await this.cacheMatch(item, match, businessId);
      return match;
    }

    // 4. Human confirmation needed
    return this.requestHumanConfirmation(item, businessId, inventory);
  }

  async aiMatch(item, inventory) {
    try {
      const inventoryList = inventory.map(i => `${i.name} (${i.type})`).join(', ');
      
      const aiResult = await matchItemWithAI(item.name, inventoryList);
      if (!aiResult) return null;
      
      const { matchedName, confidence } = aiResult;
      
      const matchedItem = inventory.find(i => 
        i.name.toLowerCase().trim() === matchedName.toLowerCase().trim()
      );
      
      if (matchedItem && confidence >= 0.6) {
        logger.info('AI matching successful', {
          originalItem: item.name,
          matchedItem: matchedItem.name,
          confidence
        });
        return { item: matchedItem, confidence };
      }
      
      logger.debug('AI matching failed', {
        originalItem: item.name,
        matchedName,
        confidence
      });
      
      return null;
    } catch (error) {
      logger.error('AI matching error:', error);
      return null;
    }
  }

  createMatchResult(originalItem, matchedItem, confidence) {
    return {
      originalItem,
      matchedItem,
      quantity: originalItem.quantity,
      unitPrice: parseFloat(matchedItem.price),
      totalPrice: parseFloat(matchedItem.price) * originalItem.quantity,
      confidence,
      type: matchedItem.type
    };
  }

  calculateOverallConfidence(matchedItems) {
    if (matchedItems.length === 0) return 0;
    
    const totalConfidence = matchedItems.reduce((sum, item) => sum + item.confidence, 0);
    return totalConfidence / matchedItems.length;
  }

  async handleNoItemsCase(orderData, businessId) {
    const inventory = await this.inventoryService.getBusinessInventoryOptimized(businessId);
    
    if (inventory.length === 0) {
      return { 
        matchedItems: [], 
        totalRevenue: 0, 
        confidence: 0, 
        status: 'no_inventory' 
      };
    }
    
    if (inventory.length === 1) {
      // Single item business - auto-assign
      const item = inventory[0];
      return {
        matchedItems: [{
          originalItem: { name: 'Auto-assigned', quantity: 1 },
          matchedItem: item,
          quantity: 1,
          unitPrice: parseFloat(item.price),
          totalPrice: parseFloat(item.price),
          confidence: 1.0,
          type: item.type
        }],
        totalRevenue: parseFloat(item.price),
        confidence: 1.0,
        status: 'auto_assigned'
      };
    }
    
    // Multiple items - needs clarification
    return {
      matchedItems: [],
      totalRevenue: 0,
      confidence: 0,
      status: 'needs_clarification',
      message: `Please specify what item you'd like to order. Available items:\n${inventory.map(item => `• ${item.name} - ₦${item.price}`).join('\n')}`,
      inventory: inventory
    };
  }

  async checkCache(item, businessId) {
    try {
      const itemHash = this.generateItemHash(item.name);
      
      const cached = await database.query('item_matching_cache')
        .where('business_id', businessId)
        .where('original_text_hash', itemHash)
        .where('expires_at', '>', new Date())
        .first();
      
      if (cached) {
        logger.debug('Found cached match', { itemName: item.name, confidence: cached.confidence_score });
        inventoryMemoryMonitor.recordCacheHit();
        
        // Fetch the full inventory item to get name and price
        const fullInventory = await this.inventoryService.getBusinessInventoryOptimized(businessId);
        const matchedItem = fullInventory.find(i => i.id === cached.matched_item_id);
        
        if (matchedItem) {
          return {
            ...matchedItem,
            confidence: parseFloat(cached.confidence_score)
          };
        } else {
          logger.warn('Cached item not found in inventory, removing from cache', { 
            cachedItemId: cached.matched_item_id 
          });
          // Remove the invalid cache entry
          await database.query('item_matching_cache')
            .where('id', cached.id)
            .del();
          return null;
        }
      }
      
      inventoryMemoryMonitor.recordCacheMiss();
      return null;
    } catch (error) {
      logger.error('Error checking cache:', error);
      inventoryMemoryMonitor.recordCacheMiss();
      return null;
    }
  }

  async cacheMatch(item, match, businessId) {
    try {
      const itemHash = this.generateItemHash(item.name);
      
      await database.query('item_matching_cache').insert({
        business_id: businessId,
        original_text_hash: itemHash,
        matched_item_id: match.matchedItem.id,
        matched_item_type: match.matchedItem.type,
        confidence_score: match.confidence,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
      });
      
      logger.debug('Cached match result', { itemName: item.name, confidence: match.confidence });
    } catch (error) {
      logger.error('Error caching match:', error);
    }
  }

  generateItemHash(text) {
    return crypto.createHash('md5').update(text.toLowerCase().trim()).digest('hex');
  }

  requestHumanConfirmation(item, businessId, inventory) {
    // This method is called when no match is found
    // The actual clarification will be handled by OrderService.handleClarificationRequired
    // We return null to indicate no match was found
    return null;
  }

  async recordMatchResult(businessId, originalText, matchedItemId, matchedItemType, userConfirmed, confidenceScore) {
    await this.confidenceService.recordMatchResult(
      businessId, 
      originalText, 
      matchedItemId, 
      matchedItemType, 
      userConfirmed, 
      confidenceScore
    );
  }
}

module.exports = InventoryMatchingService; 