const logger = require('./logger');

class MemoryMonitor {
  constructor() {
    this.interval = null;
    this.warningThreshold = 500 * 1024 * 1024; // 500MB (more conservative)
    this.criticalThreshold = 800 * 1024 * 1024; // 800MB (more conservative)
    this.restartThreshold = 1200 * 1024 * 1024; // 1.2GB - restart bot (more conservative)
    this.lastCleanup = Date.now();
    this.cleanupInterval = 15 * 60 * 1000; // 15 minutes (less frequent)
    this.restartCount = 0;
    this.maxRestartsPerHour = 2; // Limit restarts
    this.lastRestartTime = 0;
    this.lastDetailedLog = null;
  }

  start(intervalMs = 300000) { // Check every 5 minutes (less frequent)
    this.interval = setInterval(() => {
      this.checkMemoryUsage();
    }, intervalMs);
    
    logger.info('Conservative memory monitor started');
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('Memory monitor stopped');
    }
  }

  checkMemoryUsage() {
    const memUsage = process.memoryUsage();
    const rssMB = Math.round(memUsage.rss / 1024 / 1024);
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const externalMB = Math.round(memUsage.external / 1024 / 1024);

    const memoryInfo = {
      rss: `${rssMB}MB`,
      heapUsed: `${heapUsedMB}MB`,
      heapTotal: `${heapTotalMB}MB`,
      external: `${externalMB}MB`,
      heapUtilization: `${Math.round((heapUsedMB / heapTotalMB) * 100)}%`
    };

    // Log memory usage
    logger.info('Memory usage:', memoryInfo);

    // Log detailed breakdown for debugging
    this.logMemoryBreakdown(memUsage);

    // Aggressive cleanup if memory is high
    if (memUsage.rss > this.criticalThreshold) {
      this.performAggressiveCleanup();
    } else if (memUsage.rss > this.warningThreshold) {
      this.performStandardCleanup();
    }

    // Regular cleanup every 15 minutes
    if (Date.now() - this.lastCleanup > this.cleanupInterval) {
      this.performStandardCleanup();
      this.lastCleanup = Date.now();
    }

    // Check for critical memory usage
    if (memUsage.rss > this.restartThreshold) {
      logger.error('CRITICAL: Memory usage exceeded restart threshold!', memoryInfo);
      this.requestRestart();
    } else if (memUsage.rss > this.criticalThreshold) {
      logger.error('CRITICAL: High memory usage detected!', memoryInfo);
    } else if (memUsage.rss > this.warningThreshold) {
      logger.warn('WARNING: High memory usage detected', memoryInfo);
    }

    // Force garbage collection if heap usage is high
    if (memUsage.heapUsed > memUsage.heapTotal * 0.7) { // Reduced threshold
      if (global.gc) {
        global.gc();
        logger.info('Garbage collection triggered');
      }
    }
  }

  logMemoryBreakdown(memUsage) {
    // Only log detailed breakdown every 10 minutes to avoid spam
    if (!this.lastDetailedLog || Date.now() - this.lastDetailedLog > 10 * 60 * 1000) {
      this.lastDetailedLog = Date.now();
      
      const breakdown = {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
        arrayBuffers: `${Math.round((memUsage.arrayBuffers || 0) / 1024 / 1024)}MB`,
        heapUtilization: `${Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)}%`
      };

      logger.info('Detailed memory breakdown:', breakdown);
      
      // Log WhatsApp-specific memory info if available
      if (global.whatsappService) {
        const whatsappInfo = {
          messageHistoryCount: global.whatsappService.messageHistory?.length || 0,
          pendingSetupsCount: global.whatsappService.pendingSetups?.size || 0,
          isAuthenticated: global.whatsappService.isAuthenticated,
          hasClient: !!global.whatsappService.client
        };
        logger.info('WhatsApp service memory info:', whatsappInfo);
      }
    }
  }

  performStandardCleanup() {
    logger.info('Performing standard memory cleanup...');
    
    // Only clear non-essential module cache
    this.clearModuleCache();
    
    // Clear application caches (but not WhatsApp data)
    this.clearCaches();
    
    // Force garbage collection (but only once)
    if (global.gc) {
      global.gc();
    }
  }

  performAggressiveCleanup() {
    logger.warn('Performing aggressive memory cleanup...');
    
    // Standard cleanup
    this.performStandardCleanup();
    
    // Clear more aggressive caches (but preserve WhatsApp session)
    this.clearAggressiveCaches();
    
    // Multiple garbage collection passes (but spaced out)
    if (global.gc) {
      global.gc();
      // Only do additional GC if memory is still high
      setTimeout(() => {
        if (process.memoryUsage().rss > this.criticalThreshold) {
          global.gc();
        }
      }, 2000);
    }
  }

  clearModuleCache() {
    // Clear cache for non-essential modules
    const modulesToClear = [
      'fs', 'path', 'url', 'querystring', 'crypto',
      'stream', 'buffer', 'events', 'util'
    ];
    
    modulesToClear.forEach(moduleName => {
      if (require.cache[require.resolve(moduleName)]) {
        delete require.cache[require.resolve(moduleName)];
      }
    });
  }

  clearCaches() {
    // Clear any application-level caches
    if (global.cacheService) {
      global.cacheService.clear();
    }
    
    // Clear setTimeout and setInterval references
    // (This is handled by the garbage collector)
  }

  clearAggressiveCaches() {
    // Clear application caches
    this.clearCaches();
    
    // Clear console buffer (but don't clear browser console)
    console.clear();
    
    // DON'T clear WhatsApp browser cache - could cause instability
    // Only clear if explicitly needed and safe
  }

  requestRestart() {
    // Check if we've restarted too recently
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    // Reset restart count if more than an hour has passed
    if (this.lastRestartTime < oneHourAgo) {
      this.restartCount = 0;
    }
    
    // Don't restart if we've already restarted too many times
    if (this.restartCount >= this.maxRestartsPerHour) {
      logger.error('Maximum restarts per hour reached. Skipping restart to maintain stability.');
      return;
    }
    
    logger.error('Requesting bot restart due to memory issues...');
    
    // Update restart tracking
    this.restartCount++;
    this.lastRestartTime = now;
    
    // Emit restart event
    process.emit('restart-requested', {
      reason: 'memory_usage',
      memory: this.getMemoryUsage(),
      restartCount: this.restartCount
    });
  }

  getMemoryUsage() {
    const memUsage = process.memoryUsage();
    return {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    };
  }
}

// Create singleton instance
const memoryMonitor = new MemoryMonitor();

module.exports = memoryMonitor; 