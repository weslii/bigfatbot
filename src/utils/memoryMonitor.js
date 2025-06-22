const logger = require('./logger');

class MemoryMonitor {
  constructor() {
    this.interval = null;
    this.warningThreshold = 400 * 1024 * 1024; // 400MB (increased from 200MB)
    this.criticalThreshold = 800 * 1024 * 1024; // 800MB (increased from 400MB)
  }

  start(intervalMs = 300000) { // Check every 5 minutes (reduced from 1 minute)
    this.interval = setInterval(() => {
      this.checkMemoryUsage();
    }, intervalMs);
    
    logger.info('Memory monitor started');
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

    // Check for warnings
    if (memUsage.rss > this.criticalThreshold) {
      logger.error('CRITICAL: High memory usage detected!', memoryInfo);
    } else if (memUsage.rss > this.warningThreshold) {
      logger.warn('WARNING: High memory usage detected', memoryInfo);
    }

    // Force garbage collection if heap usage is high
    if (memUsage.heapUsed > memUsage.heapTotal * 0.8) {
      if (global.gc) {
        global.gc();
        logger.info('Garbage collection triggered');
      }
    }
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