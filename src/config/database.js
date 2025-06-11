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

// Test the connection
db.raw('SELECT 1')
  .then(() => {
    logger.info('Database connection established successfully');
  })
  .catch((error) => {
    logger.error('Database connection failed:', error);
    process.exit(1);
  });

module.exports = db;