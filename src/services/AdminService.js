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

  static async getAllOrdersWithDetails({ status, business, search } = {}) {
    try {
      const query = database.query('orders as o')
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

      if (status) {
        query.where('o.status', status);
      }
      if (business) {
        query.where('g.business_id', business);
      }
      if (search) {
        query.where(function() {
          this.where('u.username', 'ilike', `%${search}%`)
              .orWhere('o.id', 'ilike', `%${search}%`);
        });
      }
      return await query;
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

  static async deleteOrder(orderId) {
    try {
      await database.query('orders').where('id', orderId).del();
    } catch (error) {
      logger.error('Error deleting order:', error);
      throw error;
    }
  }

  static async getOrderById(orderId) {
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
        .where('o.id', orderId)
        .first();
    } catch (error) {
      logger.error('Error getting order by ID:', error);
      throw error;
    }
  }

  static async editOrder(orderId, data) {
    try {
      const updateData = {};
      if (data.status) updateData.status = data.status;
      if (data.items) updateData.items = data.items;
      updateData.updated_at = database.query.fn.now();
      await database.query('orders').where('id', orderId).update(updateData);
    } catch (error) {
      logger.error('Error editing order:', error);
      throw error;
    }
  }

  static async getAllBusinessesWithOwners() {
    try {
      return await database.query('groups as g')
        .select(
          'g.business_id',
          'g.business_name',
          'g.is_active',
          'g.owner_id',
          'u.username as owner_name',
          'u.email as owner_email'
        )
        .leftJoin('users as u', 'g.owner_id', 'u.id')
        .orderBy('g.business_name');
    } catch (error) {
      logger.error('Error getting all businesses with owners:', error);
      throw error;
    }
  }

  static async getBusinessById(businessId) {
    try {
      return await database.query('groups as g')
        .select(
          'g.business_id',
          'g.business_name',
          'g.is_active',
          'g.owner_id',
          'u.username as owner_name',
          'u.email as owner_email'
        )
        .leftJoin('users as u', 'g.owner_id', 'u.id')
        .where('g.business_id', businessId)
        .first();
    } catch (error) {
      logger.error('Error getting business by ID:', error);
      throw error;
    }
  }

  static async addBusiness(data) {
    try {
      await database.query('groups').insert({
        business_id: data.business_id,
        business_name: data.business_name,
        is_active: data.is_active !== undefined ? data.is_active : true,
        owner_id: data.owner_id
      });
    } catch (error) {
      logger.error('Error adding business:', error);
      throw error;
    }
  }

  static async editBusiness(businessId, data) {
    try {
      await database.query('groups')
        .where('business_id', businessId)
        .update({
          business_name: data.business_name,
          is_active: data.is_active !== undefined ? data.is_active : true,
          owner_id: data.owner_id
        });
    } catch (error) {
      logger.error('Error editing business:', error);
      throw error;
    }
  }

  static async toggleBusinessActive(businessId) {
    try {
      const business = await database.query('groups')
        .where('business_id', businessId)
        .first();
      if (!business) throw new Error('Business not found');
      await database.query('groups')
        .where('business_id', businessId)
        .update({ is_active: !business.is_active });
    } catch (error) {
      logger.error('Error toggling business active:', error);
      throw error;
    }
  }

  static async deleteBusiness(businessId) {
    try {
      await database.query('groups').where('business_id', businessId).del();
    } catch (error) {
      logger.error('Error deleting business:', error);
      throw error;
    }
  }

  static async getAllUsers() {
    try {
      return await database.query('users')
        .select('id', 'username', 'email', 'phone_number', 'is_active', 'created_at')
        .orderBy('created_at', 'desc');
    } catch (error) {
      logger.error('Error getting all users:', error);
      throw error;
    }
  }

  static async getUserById(userId) {
    try {
      return await database.query('users')
        .select('id', 'username', 'email', 'phone_number', 'is_active', 'created_at')
        .where('id', userId)
        .first();
    } catch (error) {
      logger.error('Error getting user by ID:', error);
      throw error;
    }
  }

  static async addUser(data) {
    try {
      await database.query('users').insert({
        username: data.username,
        email: data.email,
        phone_number: data.phone_number,
        is_active: data.is_active !== undefined ? data.is_active : true
      });
    } catch (error) {
      logger.error('Error adding user:', error);
      throw error;
    }
  }

  static async editUser(userId, data) {
    try {
      await database.query('users')
        .where('id', userId)
        .update({
          username: data.username,
          email: data.email,
          phone_number: data.phone_number,
          is_active: data.is_active !== undefined ? data.is_active : true
        });
    } catch (error) {
      logger.error('Error editing user:', error);
      throw error;
    }
  }

  static async toggleUserActive(userId) {
    try {
      const user = await database.query('users')
        .where('id', userId)
        .first();
      if (!user) throw new Error('User not found');
      await database.query('users')
        .where('id', userId)
        .update({ is_active: !user.is_active });
    } catch (error) {
      logger.error('Error toggling user active:', error);
      throw error;
    }
  }

  static async deleteUser(userId) {
    try {
      await database.query('users').where('id', userId).del();
    } catch (error) {
      logger.error('Error deleting user:', error);
      throw error;
    }
  }
}

module.exports = AdminService; 