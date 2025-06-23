const database = require('../config/database');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');
const ShortCodeGenerator = require('../utils/shortCodeGenerator');
const WhatsAppService = require('./WhatsAppService');

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

  static async getAllOrdersWithDetails({ status, business, search, limit = 10, offset = 0 } = {}) {
    try {
      const query = database.query('orders as o')
        .select(
          'o.id as order_id',
          'o.status',
          'o.created_at',
          'o.updated_at',
          'o.items',
          'o.customer_name',
          'g.business_name',
          'g.business_id'
        )
        .leftJoin('groups as g', 'o.business_id', 'g.business_id')
        .orderBy('o.created_at', 'desc')
        .limit(limit)
        .offset(offset);
      if (status) {
        query.where('o.status', status);
      }
      if (business) {
        query.where('g.business_id', business);
      }
      if (search) {
        query.where(function() {
          this.where('o.customer_name', 'ilike', `%${search}%`)
              .orWhere('o.id', 'ilike', `%${search}%`);
        });
      }
      const orders = await query;
      // Get total count for pagination
      const countQuery = database.query('orders as o')
        .leftJoin('groups as g', 'o.business_id', 'g.business_id');
      if (status) countQuery.where('o.status', status);
      if (business) countQuery.where('g.business_id', business);
      if (search) {
        countQuery.where(function() {
          this.where('o.customer_name', 'ilike', `%${search}%`)
              .orWhere('o.id', 'ilike', `%${search}%`);
        });
      }
      const [{ count }] = await countQuery.count('o.id as count');
      return { orders, total: parseInt(count) };
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
          'o.customer_name',
          'g.business_name',
          'g.business_id'
        )
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

  static async getAllBusinessesWithOwners(limit = 10, offset = 0, search = '') {
    try {
      const query = database.query('groups as g')
        .select(
          'g.business_id',
          'g.business_name',
          'g.user_id',
          'g.short_code',
          'g.setup_identifier',
          'g.is_active',
          'u.full_name as owner_name',
          'u.email as owner_email'
        )
        .leftJoin('users as u', 'g.user_id', 'u.id')
        .orderBy('g.business_name')
        .limit(limit)
        .offset(offset);
      if (search) {
        query.where(function() {
          this.where('g.business_name', 'ilike', `%${search}%`)
              .orWhere('u.full_name', 'ilike', `%${search}%`);
        });
      }
      const businesses = await query;
      // Count query with search
      const countQuery = database.query('groups as g')
        .leftJoin('users as u', 'g.user_id', 'u.id');
      if (search) {
        countQuery.where(function() {
          this.where('g.business_name', 'ilike', `%${search}%`)
              .orWhere('u.full_name', 'ilike', `%${search}%`);
        });
      }
      const [{ count }] = await countQuery.countDistinct('g.business_id as count');
      return { businesses, total: parseInt(count) };
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
          'g.user_id',
          'u.full_name as owner_name',
          'u.email as owner_email'
        )
        .leftJoin('users as u', 'g.user_id', 'u.id')
        .where('g.business_id', businessId)
        .first();
    } catch (error) {
      logger.error('Error getting business by ID:', error);
      throw error;
    }
  }

  static async addBusiness(data) {
    try {
      // Generate short code and setup identifier
      const { shortCode, setupIdentifier } = await ShortCodeGenerator.generateBusinessSetupCode(data.business_name);
      
      await database.query('groups').insert({
        business_id: data.business_id,
        business_name: data.business_name,
        user_id: data.user_id,
        short_code: shortCode,
        setup_identifier: setupIdentifier
      });

      return {
        business_id: data.business_id,
        business_name: data.business_name,
        short_code: shortCode,
        setup_identifier: setupIdentifier
      };
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
          user_id: data.user_id
        });
    } catch (error) {
      logger.error('Error editing business:', error);
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
        .select('id', 'full_name', 'email', 'phone_number', 'created_at')
        .orderBy('created_at', 'desc');
    } catch (error) {
      logger.error('Error getting all users:', error);
      throw error;
    }
  }

  static async getUserById(userId) {
    try {
      return await database.query('users')
        .select('id', 'full_name', 'email', 'phone_number', 'created_at')
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
        full_name: data.full_name,
        email: data.email,
        phone_number: data.phone_number
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
          full_name: data.full_name,
          email: data.email,
          phone_number: data.phone_number
        });
    } catch (error) {
      logger.error('Error editing user:', error);
      throw error;
    }
  }

  static async deleteUser(userId) {
    try {
      // Get user details for confirmation
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Check if user has associated businesses
      const userBusinesses = await database.query('groups')
        .where('user_id', userId)
        .select('business_id', 'business_name');

      // Check if user has associated orders through their businesses
      let totalUserOrders = 0;
      if (userBusinesses.length > 0) {
        const businessIds = userBusinesses.map(biz => biz.business_id);
        const userOrders = await database.query('orders')
          .whereIn('business_id', businessIds)
          .count('* as count')
          .first();
        totalUserOrders = parseInt(userOrders.count);
      }

      const hasData = userBusinesses.length > 0 || totalUserOrders > 0;

      if (hasData) {
        // User has data - delete everything
        // 1. Delete orders first (through business relationship)
        if (totalUserOrders > 0) {
          const businessIds = userBusinesses.map(biz => biz.business_id);
          await database.query('orders').whereIn('business_id', businessIds).del();
        }

        // 2. Delete businesses (groups)
        if (userBusinesses.length > 0) {
          await database.query('groups').where('user_id', userId).del();
        }

        // 3. Delete user
        await database.query('users').where('id', userId).del();

        return {
          success: true,
          message: `User "${user.full_name}" deleted successfully along with ${userBusinesses.length} business(es) and ${totalUserOrders} order(s).`,
          deletedBusinesses: userBusinesses.length,
          deletedOrders: totalUserOrders,
          wasBulkDelete: true
        };
      } else {
        // User has no data - just delete user
      await database.query('users').where('id', userId).del();
        
        return {
          success: true,
          message: `User "${user.full_name}" deleted successfully.`,
          deletedBusinesses: 0,
          deletedOrders: 0,
          wasBulkDelete: false
        };
      }
    } catch (error) {
      logger.error('Error deleting user:', error);
      throw error;
    }
  }

  static async getAllAdmins() {
    try {
      return await database.query('admins')
        .select('id', 'username', 'email', 'role', 'is_active', 'last_login')
        .orderBy('username');
    } catch (error) {
      logger.error('Error getting all admins:', error);
      throw error;
    }
  }

  static async addAdmin(data) {
    try {
      await database.query('admins').insert({
        username: data.username,
        email: data.email,
        password_hash: data.password ? await require('bcryptjs').hash(data.password, 10) : '',
        role: data.role || 'admin',
        is_active: data.is_active !== undefined ? data.is_active : true
      });
    } catch (error) {
      logger.error('Error adding admin:', error);
      throw error;
    }
  }

  static async editAdmin(adminId, data) {
    try {
      const updateData = {
        email: data.email,
        role: data.role,
        is_active: data.is_active !== undefined ? data.is_active : true
      };
      if (data.password) {
        updateData.password_hash = await require('bcryptjs').hash(data.password, 10);
      }
      await database.query('admins')
        .where('id', adminId)
        .update(updateData);
    } catch (error) {
      logger.error('Error editing admin:', error);
      throw error;
    }
  }

  static async toggleAdminActive(adminId) {
    try {
      const admin = await database.query('admins')
        .where('id', adminId)
        .first();
      if (!admin) throw new Error('Admin not found');
      await database.query('admins')
        .where('id', adminId)
        .update({ is_active: !admin.is_active });
    } catch (error) {
      logger.error('Error toggling admin active:', error);
      throw error;
    }
  }

  static async deleteAdmin(adminId) {
    try {
      await database.query('admins').where('id', adminId).del();
    } catch (error) {
      logger.error('Error deleting admin:', error);
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

  static async getPercentageChange(table, column = '*') {
    // Get this month and last month counts
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const thisMonth = await database.query(table)
      .where(column === '*' ? {} : { [column]: true })
      .where('created_at', '>=', startOfThisMonth)
      .count('* as count').first();
    const lastMonth = await database.query(table)
      .where(column === '*' ? {} : { [column]: true })
      .where('created_at', '>=', startOfLastMonth)
      .where('created_at', '<', startOfThisMonth)
      .count('* as count').first();
    const thisVal = parseInt(thisMonth.count);
    const lastVal = parseInt(lastMonth.count);
    const percent = lastVal === 0 ? 100 : ((thisVal - lastVal) / lastVal) * 100;
    return percent;
  }

  static async getBotManagementMetrics() {
    const botService = WhatsAppService.getInstance();
    const info = await botService.getBotInfo();
    const metrics = await botService.getBotMetrics();
    return { ...info, ...metrics };
  }

  static async getAnalytics() {
    try {
      const [userCount, businessCount, orderCount, activeOrderCount, revenueResult, statusCounts] = await Promise.all([
        database.query('users').count('* as count').first(),
        database.query('groups').where('is_active', true).countDistinct('business_id as count').first(),
        database.query('orders').count('* as count').first(),
        database.query('orders').whereIn('status', ['pending', 'processing']).count('* as count').first(),
        database.query('orders').sum('total_amount as revenue').first(),
        database.query('orders')
          .select('status')
          .count('* as count')
          .groupBy('status')
      ]);
      const orderStatusCounts = {};
      statusCounts.forEach(row => {
        orderStatusCounts[row.status] = parseInt(row.count);
      });
      // Percentage changes
      const businessChange = await this.getPercentageChange('groups', 'is_active');
      const orderChange = await this.getPercentageChange('orders');
      // Bot management metrics
      const botMetrics = await this.getBotManagementMetrics();
      return {
        totalRevenue: parseFloat(revenueResult.revenue || 0).toFixed(2),
        totalBusinesses: parseInt(businessCount.count),
        totalOrders: parseInt(orderCount.count),
        totalUsers: parseInt(userCount.count),
        activeOrders: parseInt(activeOrderCount.count),
        orderStatusCounts,
        businessChange,
        orderChange,
        ...botMetrics
      };
    } catch (error) {
      logger.error('Error getting analytics:', error);
      throw error;
    }
  }
}

module.exports = AdminService; 