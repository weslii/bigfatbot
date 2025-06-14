const database = require('../config/database');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');

class AdminService {
  static async createAdmin(username, email, password, role = 'admin') {
    try {
      const passwordHash = await bcrypt.hash(password, 10);
      
      const [admin] = await database.query('admins')
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
      const admin = await database.query('admins')
        .where('username', username)
        .first();

      if (!admin) {
        return null;
      }

      const isValid = await bcrypt.compare(password, admin.password_hash);
      if (!isValid) {
        return null;
      }

      // Update last login timestamp
      await database.query('admins')
        .where('id', admin.id)
        .update({
          last_login: database.query.fn.now()
        });

      return {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      };
    } catch (error) {
      logger.error('Error authenticating admin:', error);
      throw error;
    }
  }

  static async getSystemStats() {
    try {
      const [userCount, businessCount, orderCount] = await Promise.all([
        database.query('users').count('* as count').first(),
        database.query('groups').countDistinct('business_id as count').first(),
        database.query('orders').count('* as count').first()
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
      return await database.query('groups')
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
      return await database.query('orders')
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
      const admin = await database.query('admins')
        .where('id', id)
        .first();

      if (!admin) {
        return null;
      }

      return {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        last_login: admin.last_login,
        is_active: admin.is_active
      };
    } catch (error) {
      logger.error('Error getting admin by ID:', error);
      throw error;
    }
  }

  static async updateAdmin(id, data) {
    try {
      const [admin] = await database.query('admins')
        .where('id', id)
        .update({
          email: data.email,
          role: data.role,
          is_active: data.is_active
        })
        .returning('*');

      return admin;
    } catch (error) {
      logger.error('Error updating admin:', error);
      throw error;
    }
  }

  static async getAllOrdersWithDetails() {
    try {
      return await database.query('orders as o')
        .select(
          'o.id as order_id',
          'o.status',
          'o.created_at',
          'o.updated_at',
          'o.items',
          'u.username as customer_name',
          'g.business_name',
          'g.business_id'
        )
        .leftJoin('users as u', 'o.user_id', 'u.id')
        .leftJoin('groups as g', 'o.business_id', 'g.business_id')
        .orderBy('o.created_at', 'desc');
    } catch (error) {
      logger.error('Error getting all orders with details:', error);
      throw error;
    }
  }

  static async markOrderCompleted(orderId) {
    try {
      await database.query('orders')
        .where('id', orderId)
        .update({ status: 'completed', updated_at: database.query.fn.now() });
    } catch (error) {
      logger.error('Error marking order as completed:', error);
      throw error;
    }
  }
}

module.exports = AdminService; 