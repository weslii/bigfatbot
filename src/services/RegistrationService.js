const { database } = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

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
}

module.exports = RegistrationService; 