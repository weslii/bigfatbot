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

module.exports = database;