const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const redis = require('redis');
const logger = require('../utils/logger');

module.exports = async () => {
  const redisUrl = process.env.REDIS_URL;
  console.log('Redis URL:', redisUrl ? 'Set' : 'Not set');

  if (!redisUrl) {
    console.error('REDIS_URL is not set. Session storage will not work properly.');
    process.exit(1);
  }

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

  try {
    // Wait for Redis to be ready
    await new Promise((resolve, reject) => {
      redisClient.once('ready', resolve);
      redisClient.once('error', reject);
    });

    // Create Redis store instance
    const store = new RedisStore({ 
      client: redisClient,
      prefix: 'sess:',
      ttl: 86400, // 24 hours in seconds
      disableTouch: false, // Enable touch to extend session lifetime
      scanCount: 100, // Number of keys to scan per iteration
      serializer: {
        stringify: (data) => JSON.stringify(data),
        parse: (data) => JSON.parse(data)
      }
    });

    store.on('error', (err) => {
      console.error('Redis store error:', err);
    });

    // Configure session middleware
    const config = {
      store: store,
      secret: process.env.SESSION_SECRET || 'your-secret-key',
      resave: true,
      saveUninitialized: true,
      rolling: true,
      name: 'sessionId',
      cookie: {
        // For debugging, always set secure: false
        secure: false,
        sameSite: 'lax',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/'
      }
    };

    return { store, config };
  } catch (err) {
    console.error('Failed to initialize session:', err);
    throw err;
  }
}; 