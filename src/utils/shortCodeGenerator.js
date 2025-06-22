const database = require('../config/database');
const logger = require('./logger');

class ShortCodeGenerator {
  static generateShortCode() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    
    let code = '';
    
    // Generate 3 random letters
    for (let i = 0; i < 3; i++) {
      code += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    
    // Generate 3 random numbers
    for (let i = 0; i < 3; i++) {
      code += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }
    
    return code; // Format: ABC123
  }

  static async generateUniqueShortCode() {
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      const shortCode = this.generateShortCode();
      
      try {
        // Check if short_code column exists first
        const columnExists = await database.query.raw(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'groups' AND column_name = 'short_code'
        `);
        
        if (columnExists.rows.length === 0) {
          // Migration hasn't run yet, return a temporary code
          logger.warn('short_code column not found, using temporary code');
          return shortCode;
        }
        
        // Check if code already exists
        const existing = await database.query('groups')
          .where('short_code', shortCode)
          .first();
        
        if (!existing) {
          return shortCode;
        }
      } catch (error) {
        // If there's any error, assume migration hasn't run
        logger.warn('Error checking short_code, using temporary code:', error.message);
        return shortCode;
      }
      
      attempts++;
    }
    
    throw new Error('Unable to generate unique short code after 10 attempts');
  }

  static createSetupIdentifier(businessName, shortCode) {
    // Convert business name to lowercase, remove spaces and special chars
    const cleanName = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') // Remove special characters
      .substring(0, 20); // Limit length
    
    return `${cleanName}-${shortCode}`;
  }

  static async generateBusinessSetupCode(businessName) {
    try {
      const shortCode = await this.generateUniqueShortCode();
      const setupIdentifier = this.createSetupIdentifier(businessName, shortCode);
      
      return {
        shortCode,
        setupIdentifier
      };
    } catch (error) {
      logger.error('Error generating business setup code:', error);
      throw error;
    }
  }

  static async findBusinessBySetupIdentifier(setupIdentifier) {
    try {
      // First try exact match
      let business = await database.query('groups')
        .where('setup_identifier', setupIdentifier)
        .first();
      
      if (business) {
        return business;
      }
      
      // If not found, try case-insensitive search
      business = await database.query('groups')
        .whereRaw('LOWER(setup_identifier) = LOWER(?)', [setupIdentifier])
        .first();
      
      return business;
    } catch (error) {
      logger.error('Error finding business by setup identifier:', error);
      return null;
    }
  }
}

module.exports = ShortCodeGenerator; 