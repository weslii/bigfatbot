const db = require('../config/database');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');

class AdminService {
  static async createAdmin(username, email, password, role = 'admin') {
    try {
      const passwordHash = await bcrypt.hash(password, 10);
      
      const [admin] = await db('admins')
        .insert({
          username,
          email,
          password_hash: passwordHash,
          role
        })
        .returning('*');

      return admin;
    } catch (error) {
      logger.error('Error creating admin:', error);
      throw error;
    }
  }

  static async authenticate(username, password) {
    try {
      logger.debug('Authenticating admin:', { username });
      
      const admin = await db('admins')
        .where({ username, is_active: true })
        .first();

      if (!admin) {
        logger.debug('Admin not found or not active:', { username });
        return null;
      }

      const isValid = await bcrypt.compare(password, admin.password_hash);
      if (!isValid) {
        logger.debug('Invalid password for admin:', { username });
        return null;
      }

      logger.debug('Admin authenticated successfully:', { username, id: admin.id });

      // Update last login
      await db('admins')
        .where({ id: admin.id })
        .update({ last_login: db.fn.now() });

      return admin;
    } catch (error) {
      logger.error('Error authenticating admin:', error);
      throw error;
    }
  }

  static async getSystemStats() {
    try {
      const [userCount, businessCount, orderCount] = await Promise.all([
        db('users').count('* as count').first(),
        db('groups').count('distinct business_id as count').first(),
        db('orders').count('* as count').first()
      ]);

      return {
        totalUsers: parseInt(userCount.count),
        totalBusinesses: parseInt(businessCount.count),
        totalOrders: parseInt(orderCount.count)
      };
    } catch (error) {
      logger.error('Error getting system stats:', error);
      throw error;
    }
  }

  static async getActiveBusinesses() {
    try {
      return await db('groups')
        .select('business_id', 'business_name')
        .distinct()
        .orderBy('business_name');
    } catch (error) {
      logger.error('Error getting active businesses:', error);
      throw error;
    }
  }

  static async getRecentOrders(limit = 10) {
    try {
      return await db('orders')
        .select('*')
        .orderBy('created_at', 'desc')
        .limit(limit);
    } catch (error) {
      logger.error('Error getting recent orders:', error);
      throw error;
    }
  }

  static async getAdminById(id) {
    try {
      logger.debug('Fetching admin by ID:', { id });
      
      const admin = await db('admins')
        .where({ id })
        .first();

      if (!admin) {
        logger.debug('Admin not found:', { id });
        return null;
      }

      logger.debug('Admin found:', { id, username: admin.username });
      return admin;
    } catch (error) {
      logger.error('Error fetching admin by ID:', error);
      throw error;
    }
  }
}

module.exports = AdminService; 