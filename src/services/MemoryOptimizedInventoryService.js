const database = require('../config/database');
const logger = require('../utils/logger');
const inventoryMemoryMonitor = require('../utils/inventoryMemoryMonitor');

class MemoryOptimizedInventoryService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  async getBusinessInventoryOptimized(businessId) {
    const cacheKey = `inventory_${businessId}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        logger.debug('Returning cached inventory', { businessId });
        return cached.data;
      }
    }

    // Check memory usage before querying
    if (inventoryMemoryMonitor.shouldTriggerGC()) {
      this.clearOldCache();
      inventoryMemoryMonitor.triggerGC();
    }

    try {
      const inventory = await this.fetchInventoryFromDatabase(businessId);
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: inventory,
        timestamp: Date.now()
      });
      
      logger.info('Fetched and cached inventory', { 
        businessId, 
        itemCount: inventory.length,
        memoryUsage: inventoryMemoryMonitor.getMemoryUsage()
      });
      
      return inventory;
    } catch (error) {
      logger.error('Error fetching inventory:', error);
      throw error;
    }
  }

  async fetchInventoryFromDatabase(businessId) {
    try {
      // Get products
      const products = await database.query('products')
        .where('business_id', businessId)
        .select('*')
        .then(rows => rows.map(row => ({ ...row, type: 'product' })));
      
      // Get others
      const others = await database.query('others')
        .where('business_id', businessId)
        .select('*')
        .then(rows => rows.map(row => ({ ...row, type: 'other' })));
      
      // Combine and sort
      const inventory = [...products, ...others].sort((a, b) => a.name.localeCompare(b.name));
      
      return inventory;
    } catch (error) {
      logger.error('Error fetching inventory from database:', error);
      return [];
    }
  }

  clearOldCache() {
    const now = Date.now();
    let clearedCount = 0;
    
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTTL) {
        this.cache.delete(key);
        clearedCount++;
      }
    }
    
    if (clearedCount > 0) {
      logger.info('Cleared old cache entries', { 
        clearedCount, 
        remainingEntries: this.cache.size 
      });
    }
  }

  async getInventorySummary(businessId) {
    const inventory = await this.getBusinessInventoryOptimized(businessId);
    
    const summary = {
      totalItems: inventory.length,
      products: inventory.filter(item => item.type === 'product').length,
      others: inventory.filter(item => item.type === 'other').length,
      totalValue: inventory.reduce((sum, item) => sum + parseFloat(item.price), 0),
      averagePrice: inventory.length > 0 ? 
        inventory.reduce((sum, item) => sum + parseFloat(item.price), 0) / inventory.length : 0
    };
    
    return summary;
  }

  async searchInventory(businessId, searchTerm, limit = 20) {
    const inventory = await this.getBusinessInventoryOptimized(businessId);
    
    if (!searchTerm) {
      return inventory.slice(0, limit);
    }
    
    const normalizedSearch = searchTerm.toLowerCase().trim();
    
    const results = inventory
      .filter(item => 
        item.name.toLowerCase().includes(normalizedSearch) ||
        (item.description && item.description.toLowerCase().includes(normalizedSearch))
      )
      .slice(0, limit);
    
    return results;
  }

  getCacheStats() {
    return {
      cacheSize: this.cache.size,
      memoryUsage: this.memoryMonitor.getMemoryUsage(),
      memoryStats: this.memoryMonitor.getMemoryStats()
    };
  }

  clearAllCache() {
    const size = this.cache.size;
    this.cache.clear();
    logger.info('Cleared all inventory cache', { clearedEntries: size });
  }
}

module.exports = MemoryOptimizedInventoryService; 