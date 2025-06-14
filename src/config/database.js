// src/config/database.js
const knex = require('knex');
const knexConfig = require('../../knexfile');
const logger = require('../utils/logger');

// Get the environment
const environment = process.env.NODE_ENV || 'development';

// Log connection info for debugging
if (process.env.DATABASE_URL) {
  logger.info('Using Railway DATABASE_URL connection');
} else {
  logger.info('Using individual environment variables for database connection');
}

// Create the database connection
const db = knex(knexConfig[environment]);

// Database module with connection management
const database = {
  // Get the Knex instance
  query: db,
  
  // Connect to the database
  async connect() {
    try {
      await db.raw('SELECT 1');
      logger.info('Database connection established successfully');
    } catch (error) {
      logger.error('Database connection failed:', error);
      throw error;
    }
  },
  
  // Close the database connection
  async close() {
    try {
      await db.destroy();
      logger.info('Database connection closed successfully');
    } catch (error) {
      logger.error('Error closing database connection:', error);
      throw error;
    }
  }
};

// Parse Redis URL for Railway
const redisUrl = process.env.REDIS_URL;
console.log('Redis URL:', redisUrl ? 'Set' : 'Not set');

if (!redisUrl) {
  console.error('REDIS_URL is not set. Session storage will not work properly.');
  process.exit(1);
}

// Create Redis client
const redis = require('redis');
const redisClient = redis.createClient(redisUrl, {
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

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('Redis client connected successfully');
});

redisClient.on('ready', () => {
  console.log('Redis client ready');
});

// Wait for Redis to be ready
(async () => {
  try {
    await new Promise((resolve, reject) => {
      redisClient.once('ready', resolve);
      redisClient.once('error', reject);
    });
    console.log('Redis connection established');
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    process.exit(1);
  }
})();

// Test database connection
database.raw('SELECT 1')
  .then(() => {
    console.log('Database connection successful');
  })
  .catch((err) => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });

module.exports = {
  database,
  redisClient
};