const redis = require('redis');
const logger = require('../utils/logger');

class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        logger.warn('REDIS_URL not set, caching disabled');
        return false;
      }

      this.client = redis.createClient(redisUrl, {
        legacyMode: true,
        retry_strategy: function(options) {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            return new Error('Redis connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            return new Error('Redis retry time exhausted');
          }
          if (options.attempt > 10) {
            return new Error('Redis max retries reached');
          }
          return Math.min(options.attempt * 100, 3000);
        }
      });

      this.client.on('error', (err) => {
        logger.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected successfully');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready');
        this.isConnected = true;
      });

      // Wait for connection
      await new Promise((resolve, reject) => {
        this.client.once('ready', resolve);
        this.client.once('error', reject);
      });

      return true;
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      return false;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  async get(key) {
    if (!this.isConnected || !this.client) return null;
    
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = 300) { // Default 5 minutes
    if (!this.isConnected || !this.client) return false;
    
    try {
      await this.client.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  async del(key) {
    if (!this.isConnected || !this.client) return false;
    
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('Cache del error:', error);
      return false;
    }
  }

  async flush() {
    if (!this.isConnected || !this.client) return false;
    
    try {
      await this.client.flushdb();
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  }

  // Business-specific caching methods
  async getBusinessData(businessId) {
    return await this.get(`business:${businessId}`);
  }

  async setBusinessData(businessId, data, ttl = 600) { // 10 minutes
    return await this.set(`business:${businessId}`, data, ttl);
  }

  async getBusinessOrders(businessId, filters = {}) {
    const cacheKey = `orders:${businessId}:${JSON.stringify(filters)}`;
    return await this.get(cacheKey);
  }

  async setBusinessOrders(businessId, orders, filters = {}, ttl = 300) { // 5 minutes
    const cacheKey = `orders:${businessId}:${JSON.stringify(filters)}`;
    return await this.set(cacheKey, orders, ttl);
  }

  async invalidateBusinessOrders(businessId) {
    // Delete all order caches for this business
    if (!this.isConnected || !this.client) return false;
    
    try {
      const keys = await this.client.keys(`orders:${businessId}:*`);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return true;
    } catch (error) {
      logger.error('Cache invalidation error:', error);
      return false;
    }
  }

  async getUserData(userId) {
    return await this.get(`user:${userId}`);
  }

  async setUserData(userId, data, ttl = 1800) { // 30 minutes
    return await this.set(`user:${userId}`, data, ttl);
  }

  async getOrderStats(userId) {
    return await this.get(`stats:${userId}`);
  }

  async setOrderStats(userId, stats, ttl = 600) { // 10 minutes
    return await this.set(`stats:${userId}`, stats, ttl);
  }
}

// Create singleton instance
const cacheService = new CacheService();

module.exports = cacheService; 