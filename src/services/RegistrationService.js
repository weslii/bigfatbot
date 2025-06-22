const logger = require('../utils/logger');
const database = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const ShortCodeGenerator = require('../utils/shortCodeGenerator');

class RegistrationService {
  static async registerUser(name, email, phoneNumber) {
    try {
      // Generate a unique user ID
      const userId = uuidv4();

      // Create user
      const [user] = await database.query('users')
        .insert({
          id: userId,
          full_name: name,
          email: email,
          phone_number: phoneNumber
        })
        .returning('*');

      logger.info('User registered successfully', { userId: user.id });
      return user;
    } catch (error) {
      logger.error('Error registering user:', error);
      throw error;
    }
  }

  static async registerBusiness(businessData) {
    try {
      // Check if business already exists
      const existingBusiness = await database.query('businesses')
        .where('name', businessData.name)
        .first();

      if (existingBusiness) {
        throw new Error('Business already exists');
      }

      // Create business
      const [business] = await database.query('businesses')
        .insert({
          name: businessData.name,
          owner_id: businessData.ownerId,
          contact_number: businessData.contactNumber
        })
        .returning('*');

      return business;
    } catch (error) {
      logger.error('Error registering business:', error);
      throw error;
    }
  }

  static async registerGroup(groupData) {
    try {
      // Check if group is already registered
      const existingGroup = await database.query('groups')
        .where('group_id', groupData.groupId)
        .first();

      if (existingGroup) {
        throw new Error('Group is already registered');
      }

      // Create group
      const [group] = await database.query('groups')
        .insert({
          group_id: groupData.groupId,
          business_id: groupData.businessId,
          name: groupData.name
        })
        .returning('*');

      return group;
    } catch (error) {
      logger.error('Error registering group:', error);
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
      const query = 'SELECT * FROM groups WHERE group_id = $1';
      const result = await database.query.query(query, [groupId]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error validating group:', error);
      throw error;
    }
  }

  static async validateUser(userId) {
    try {
      const query = 'SELECT * FROM users WHERE user_id = $1';
      const result = await database.query.query(query, [userId]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error validating user:', error);
      throw error;
    }
  }

  static async createBusiness(userId, businessName) {
    try {
      // Generate a unique business ID
      const businessId = uuidv4();

      // Generate short code and setup identifier
      const { shortCode, setupIdentifier } = await ShortCodeGenerator.generateBusinessSetupCode(businessName);

      // Check if short_code column exists
      const columnExists = await database.raw(`
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

      // Only add short code columns if they exist
      if (columnExists.rows.length > 0) {
        insertData.short_code = shortCode;
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
      logger.error('Error creating business:', error);
      throw error;
    }
  }

  static async addBusinessToUser(userId, businessName) {
    try {
      // Generate a unique business ID
      const businessId = uuidv4();

      // Generate short code and setup identifier
      const { shortCode, setupIdentifier } = await ShortCodeGenerator.generateBusinessSetupCode(businessName);

      // Check if short_code column exists
      const columnExists = await database.raw(`
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

      // Only add short code columns if they exist
      if (columnExists.rows.length > 0) {
        insertData.short_code = shortCode;
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
      logger.error('Error adding business to user:', error);
      throw error;
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