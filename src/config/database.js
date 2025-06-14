// src/config/database.js
const knex = require('knex');
const logger = require('../utils/logger');

// Create Knex instance
const database = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: {
    min: 2,
    max: 10
  }
});

// Test database connection
database.raw('SELECT 1')
  .then(() => {
    console.log('Database connection successful');
  })
  .catch((err) => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });

// Parse Redis URL for Railway
const redisUrl = process.env.REDIS_URL;
console.log('Redis URL:', redisUrl ? 'Set' : 'Not set');

let redisClient = null;

if (redisUrl) {
  // Create Redis client
  const redis = require('redis');
  redisClient = redis.createClient(redisUrl, {
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
      // Don't exit process, just log the error
      console.error('Redis connection failed, but continuing without Redis...');
    }
  })();
} else {
  console.warn('REDIS_URL is not set. Session storage will not work properly.');
}

module.exports = {
  database,
  redisClient
};