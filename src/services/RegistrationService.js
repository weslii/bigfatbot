const logger = require('../utils/logger');
const database = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class RegistrationService {
  static async registerUser(name, email, phoneNumber) {
    try {
      // Generate a unique user ID
      const userId = uuidv4();

      // Create user
      const user = await database.createUser(name, email, phoneNumber, userId);
      logger.info('User registered successfully', { userId: user.rows[0].user_id });
      
      return user.rows[0];
    } catch (error) {
      logger.error('Error registering user:', error);
      throw error;
    }
  }

  static async registerGroup(userId, groupName, businessName, groupType, groupId) {
    try {
      // Generate a unique business ID if this is a new business
      const existingBusiness = await database.query.query(
        'SELECT * FROM businesses WHERE user_id = $1',
        [userId]
      );

      let businessId;
      if (existingBusiness.rows.length > 0) {
        businessId = existingBusiness.rows[0].business_id;
      } else {
        businessId = uuidv4();
      }

      // Create group
      const group = await database.createGroup(
        userId,
        groupName,
        businessName,
        groupType,
        groupId,
        businessId
      );

      logger.info('Group registered successfully', {
        groupId: group.rows[0].group_id,
        businessId: group.rows[0].business_id
      });

      return group.rows[0];
    } catch (error) {
      logger.error('Error registering group:', error);
      throw error;
    }
  }

  static async getUserGroups(userId) {
    try {
      const query = `
        SELECT g.*, u.name as user_name 
        FROM groups g
        JOIN users u ON g.user_id = u.id
        WHERE g.user_id = $1
        ORDER BY g.business_name, g.group_type
      `;
      
      const result = await database.query.query(query, [userId]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting user groups:', error);
      throw error;
    }
  }

  static async getBusinessGroups(businessId) {
    try {
      const query = `
        SELECT g.*, u.name as user_name 
        FROM groups g
        JOIN users u ON g.user_id = u.id
        WHERE g.business_id = $1
        ORDER BY g.group_type
      `;
      
      const result = await database.query.query(query, [businessId]);
      return result.rows;
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