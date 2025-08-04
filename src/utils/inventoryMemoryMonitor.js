const logger = require('./logger');

class InventoryMemoryMonitor {
  constructor() {
    this.memoryThreshold = 0.8; // 80%
    this.lastGCTime = 0;
    this.gcInterval = 60000; // 1 minute
    this.cacheSizeThreshold = 1000; // Max cache entries
    this.lastCacheCleanup = 0;
    this.cacheCleanupInterval = 300000; // 5 minutes
    
    // Track inventory cache performance
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.lastPerformanceLog = 0;
    this.performanceLogInterval = 600000; // 10 minutes
  }

  getMemoryUsage() {
    const memUsage = process.memoryUsage();
    return {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
      heapUtilization: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
    };
  }

  getMemoryStats() {
    const usage = this.getMemoryUsage();
    return {
      ...usage,
      cacheHitRate: this.cacheHits + this.cacheMisses > 0 
        ? Math.round((this.cacheHits / (this.cacheHits + this.cacheMisses)) * 100)
        : 0,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses
    };
  }

  shouldTriggerGC() {
    const usage = this.getMemoryUsage();
    const now = Date.now();
    
    // Trigger GC if:
    // 1. Heap utilization is high (>80%)
    // 2. Enough time has passed since last GC (>1 minute)
    // 3. Memory usage is critical
    return (usage.heapUtilization > 80 || usage.rss > 500) && 
           (now - this.lastGCTime > this.gcInterval);
  }

  triggerGC() {
    if (global.gc) {
      global.gc();
      this.lastGCTime = Date.now();
      logger.info('Inventory memory monitor: Garbage collection triggered');
      return true;
    }
    return false;
  }

  getOptimalBatchSize() {
    const usage = this.getMemoryUsage();
    
    // Adjust batch size based on memory usage
    if (usage.heapUtilization > 90) {
      return 10; // Very small batches
    } else if (usage.heapUtilization > 80) {
      return 25; // Small batches
    } else if (usage.heapUtilization > 70) {
      return 50; // Medium batches
    } else {
      return 100; // Normal batches
    }
  }

  logMemoryUsage(context = '') {
    const stats = this.getMemoryStats();
    const contextStr = context ? ` [${context}]` : '';
    
    logger.info(`Inventory Memory Monitor${contextStr}:`, {
      memory: `${stats.rss}MB RSS, ${stats.heapUsed}MB Heap`,
      utilization: `${stats.heapUtilization}%`,
      cachePerformance: `${stats.cacheHitRate}% hit rate (${stats.cacheHits}/${stats.cacheHits + stats.cacheMisses})`
    });

    // Log performance metrics periodically
    const now = Date.now();
    if (now - this.lastPerformanceLog > this.performanceLogInterval) {
      this.lastPerformanceLog = now;
      logger.info('Inventory cache performance:', {
        hitRate: `${stats.cacheHitRate}%`,
        totalRequests: stats.cacheHits + stats.cacheMisses,
        memoryUsage: `${stats.rss}MB`
      });
    }
  }

  isMemoryCritical() {
    const usage = this.getMemoryUsage();
    return usage.heapUtilization > 95 || usage.rss > 800;
  }

  shouldCleanupCache() {
    const now = Date.now();
    return now - this.lastCacheCleanup > this.cacheCleanupInterval;
  }

  recordCacheHit() {
    this.cacheHits++;
  }

  recordCacheMiss() {
    this.cacheMisses++;
  }

  resetCacheStats() {
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  getCacheEfficiency() {
    const total = this.cacheHits + this.cacheMisses;
    return total > 0 ? (this.cacheHits / total) * 100 : 0;
  }

  // Method to suggest cache cleanup based on performance
  shouldOptimizeCache() {
    const efficiency = this.getCacheEfficiency();
    const totalRequests = this.cacheHits + this.cacheMisses;
    
    // Suggest optimization if:
    // 1. Low cache hit rate (<30%) with many requests
    // 2. High memory usage
    return (efficiency < 30 && totalRequests > 100) || this.isMemoryCritical();
  }

  // Method to get memory-aware timeout for operations
  getOperationTimeout() {
    const usage = this.getMemoryUsage();
    
    if (usage.heapUtilization > 90) {
      return 5000; // 5 seconds for critical memory
    } else if (usage.heapUtilization > 80) {
      return 10000; // 10 seconds for high memory
    } else {
      return 30000; // 30 seconds for normal memory
    }
  }

  // Method to check if we should skip non-critical operations
  shouldSkipNonCritical() {
    return this.isMemoryCritical();
  }

  // Method to get recommended cache size limit
  getRecommendedCacheSize() {
    const usage = this.getMemoryUsage();
    
    if (usage.heapUtilization > 90) {
      return 50; // Very small cache
    } else if (usage.heapUtilization > 80) {
      return 100; // Small cache
    } else if (usage.heapUtilization > 70) {
      return 250; // Medium cache
    } else {
      return 500; // Normal cache
    }
  }
}

// Create singleton instance for inventory matching
const inventoryMemoryMonitor = new InventoryMemoryMonitor();

module.exports = inventoryMemoryMonitor; 