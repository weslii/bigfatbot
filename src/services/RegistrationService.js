const logger = require('../utils/logger');
const database = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const ShortCodeGenerator = require('../utils/shortCodeGenerator');

class RegistrationService {
  static async registerUser(name, email, phoneNumber, password) {
    try {
      // Check if user already exists
      const [user] = await database.query('users')
        .where('email', email)
        .first();

      if (user) {
        throw new Error('User already exists');
      }

      // Hash the password
      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user
      const [newUser] = await database.query('users')
        .insert({
          full_name: name,
          email: email,
          phone_number: phoneNumber,
          password_hash: passwordHash
        })
        .returning('*');

      return newUser;
    } catch (error) {
      logger.error('Error registering user:', error);
      throw error;
    }
  }

  static async getUserGroups(userId) {
    try {
      const groups = await database.query('groups')
        .select('groups.*', 'users.full_name as user_name')
        .join('users', 'groups.user_id', 'users.id')
        .where('groups.user_id', userId)
        .orderBy(['groups.business_name', 'groups.group_type']);

      return groups;
    } catch (error) {
      logger.error('Error getting user groups:', error);
      throw error;
    }
  }

  static async getBusinessGroups(businessId) {
    try {
      const groups = await database.query('groups')
        .select('groups.*', 'users.full_name as user_name')
        .join('users', 'groups.user_id', 'users.id')
        .where('groups.business_id', businessId)
        .orderBy('groups.group_type');

      return groups;
    } catch (error) {
      logger.error('Error getting business groups:', error);
      throw error;
    }
  }

  static async validateGroup(groupId) {
    try {
      const group = await database.query('groups')
        .where('group_id', groupId)
        .first();
      return group;
    } catch (error) {
      logger.error('Error validating group:', error);
      throw error;
    }
  }

  static async validateUser(userId) {
    try {
      const user = await database.query('users')
        .where('id', userId)
        .first();
      return user;
    } catch (error) {
      logger.error('Error validating user:', error);
      throw error;
    }
  }

  static async createBusiness(userId, businessName) {
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        // Generate a unique business ID
        const businessId = uuidv4();

        // Generate short code and setup identifier
        const { shortCode, setupIdentifier } = await ShortCodeGenerator.generateBusinessSetupCode(businessName);

        // Check if short_code column exists
        const columnExists = await database.query.raw(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'groups' AND column_name = 'short_code'
        `);

        const insertData = {
          user_id: userId,
          business_id: businessId,
          business_name: businessName,
          group_name: `${businessName} - Main Group`,
          group_id: `default_${businessId}`,
          group_type: 'main'
        };

        // Store setup_identifier in main group for lookup, but not short_code
        // Short codes will be added to actual groups during setup
        if (columnExists.rows.length > 0) {
          insertData.setup_identifier = setupIdentifier;
        }

        // Create a default group entry for the business
        const [group] = await database.query('groups')
          .insert(insertData)
          .returning('*');

        logger.info('Business created successfully', { businessId, userId, setupIdentifier });
        return {
          businessId,
          setupIdentifier: columnExists.rows.length > 0 ? setupIdentifier : businessId
        };
      } catch (error) {
        attempts++;
        
        // If it's a duplicate short code error and we haven't exceeded max attempts, try again
        if (error.code === '23505' && error.constraint === 'groups_short_code_unique' && attempts < maxAttempts) {
          logger.warn(`Duplicate short code detected, retrying... (attempt ${attempts}/${maxAttempts})`);
          continue;
        }
        
        // For any other error or if we've exceeded attempts, throw the error
        logger.error('Error creating business:', error);
        throw error;
      }
    }
  }

  static async addBusinessToUser(userId, businessName) {
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        // Generate a unique business ID
        const businessId = uuidv4();

        // Generate short code and setup identifier
        const { shortCode, setupIdentifier } = await ShortCodeGenerator.generateBusinessSetupCode(businessName);

        // Check if short_code column exists
        const columnExists = await database.query.raw(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'groups' AND column_name = 'short_code'
        `);

        const insertData = {
          user_id: userId,
          business_id: businessId,
          business_name: businessName,
          group_name: `${businessName} - Main Group`,
          group_id: `default_${businessId}`,
          group_type: 'main'
        };

        // Store setup_identifier in main group for lookup, but not short_code
        // Short codes will be added to actual groups during setup
        if (columnExists.rows.length > 0) {
          insertData.setup_identifier = setupIdentifier;
        }

        // Create a default group entry for the business
        const [group] = await database.query('groups')
          .insert(insertData)
          .returning('*');

        logger.info('Business added to user successfully', { businessId, userId, setupIdentifier });
        return {
          businessId,
          setupIdentifier: columnExists.rows.length > 0 ? setupIdentifier : businessId
        };
      } catch (error) {
        attempts++;
        
        // If it's a duplicate short code error and we haven't exceeded max attempts, try again
        if (error.code === '23505' && error.constraint === 'groups_short_code_unique' && attempts < maxAttempts) {
          logger.warn(`Duplicate short code detected, retrying... (attempt ${attempts}/${maxAttempts})`);
          continue;
        }
        
        // For any other error or if we've exceeded attempts, throw the error
        logger.error('Error adding business to user:', error);
        throw error;
      }
    }
  }

  static async getUserBusinesses(userId) {
    try {
      const businesses = await database.query('groups')
        .select('business_id', 'business_name')
        .where('user_id', userId)
        .groupBy('business_id', 'business_name')
        .orderBy('business_name');

      return businesses;
    } catch (error) {
      logger.error('Error getting user businesses:', error);
      throw error;
    }
  }
}

module.exports = RegistrationService; 