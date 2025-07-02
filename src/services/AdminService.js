const database = require('../config/database');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');
const ShortCodeGenerator = require('../utils/shortCodeGenerator');
const WhatsAppService = require('./WhatsAppService');
const { v4: uuidv4 } = require('uuid');

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

  static async getAllOrdersWithDetails({ status, business, search, limit = 5, offset = 0 } = {}) {
    try {
      const query = database.query('orders as o')
        .select(
          'o.id',
          'o.order_id',
          'o.status',
          'o.created_at',
          'o.updated_at',
          'o.items',
          'o.customer_name',
          'o.customer_phone',
          'o.address',
          'o.delivery_date',
          'o.delivery_person',
          'o.notes',
          'o.business_id'
        )
        .orderBy('o.created_at', 'desc')
        .limit(limit)
        .offset(offset);
      
      if (status) {
        query.where('o.status', status);
      }
      if (business) {
        query.where('o.business_id', business);
      }
      if (search) {
        query.where(function() {
          this.where('o.customer_name', 'ilike', `%${search}%`)
              .orWhere('o.order_id', 'ilike', `%${search}%`);
        });
      }
      
      const orders = await query;
      
      // Get business names for the orders
      const businessIds = [...new Set(orders.map(order => order.business_id))];
      const businessNames = {};
      if (businessIds.length > 0) {
        const businesses = await database.query('groups')
          .select('business_id', 'business_name')
          .whereIn('business_id', businessIds)
          .distinct('business_id');
        
        businesses.forEach(biz => {
          businessNames[biz.business_id] = biz.business_name;
        });
      }
      
      // Add business names to orders
      const ordersWithBusinessNames = orders.map(order => ({
        ...order,
        business_name: businessNames[order.business_id] || 'Unknown Business'
      }));
      
      // Get total count for pagination
      const countQuery = database.query('orders as o');
      if (status) countQuery.where('o.status', status);
      if (business) countQuery.where('o.business_id', business);
      if (search) {
        countQuery.where(function() {
          this.where('o.customer_name', 'ilike', `%${search}%`)
              .orWhere('o.order_id', 'ilike', `%${search}%`);
        });
      }
      const [{ count }] = await countQuery.count('o.id as count');
      
      return { orders: ordersWithBusinessNames, total: parseInt(count) };
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
      const order = await database.query('orders as o')
        .select(
          'o.id',
          'o.order_id',
          'o.status',
          'o.created_at',
          'o.updated_at',
          'o.items',
          'o.customer_name',
          'o.customer_phone',
          'o.address',
          'o.delivery_date',
          'o.delivery_person',
          'o.notes',
          'o.business_id'
        )
        .where('o.id', orderId)
        .first();
      
      if (!order) return null;
      
      // Get business name separately to avoid JOIN duplicates
      const business = await database.query('groups')
        .select('business_name')
        .where('business_id', order.business_id)
        .first();
      
      return {
        ...order,
        business_name: business ? business.business_name : 'Unknown Business'
      };
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

  static async getAllBusinessesWithOwners(limit = 10, offset = 0, search = '', business_name = '', owner = '', status = '') {
    try {
      const query = database.query('groups as g')
        .select(
          'g.business_id',
          'g.business_name',
          database.query.raw('MIN(g.user_id::text) as user_id'),
          database.query.raw('MIN(g.short_code) as short_code'),
          database.query.raw('MIN(g.setup_identifier) as setup_identifier'),
          database.query.raw('MAX(g.is_active::int) = 1 as is_active'),
          database.query.raw('MIN(u.full_name) as owner_name'),
          database.query.raw('MIN(u.email) as owner_email')
        )
        .leftJoin('users as u', 'g.user_id', 'u.id')
        .groupBy('g.business_id', 'g.business_name')
        .orderBy('g.business_name')
        .limit(limit)
        .offset(offset);
      if (search) {
        query.where(function() {
          this.where('g.business_name', 'ilike', `%${search}%`)
              .orWhere('u.full_name', 'ilike', `%${search}%`);
        });
      }
      if (business_name) {
        query.where('g.business_name', 'ilike', `%${business_name}%`);
      }
      if (owner) {
        query.where(function() {
          this.where('u.full_name', 'ilike', `%${owner}%`).orWhere('u.email', 'ilike', `%${owner}%`);
        });
      }
      if (status === 'active') {
        query.where('g.is_active', true);
      } else if (status === 'inactive') {
        query.where('g.is_active', false);
      }
      const businesses = await query;
      // Count query with filters
      const countQuery = database.query('groups as g')
        .leftJoin('users as u', 'g.user_id', 'u.id');
      if (search) {
        countQuery.where(function() {
          this.where('g.business_name', 'ilike', `%${search}%`)
              .orWhere('u.full_name', 'ilike', `%${search}%`);
        });
      }
      if (business_name) {
        countQuery.where('g.business_name', 'ilike', `%${business_name}%`);
      }
      if (owner) {
        countQuery.where(function() {
          this.where('u.full_name', 'ilike', `%${owner}%`).orWhere('u.email', 'ilike', `%${owner}%`);
        });
      }
      if (status === 'active') {
        countQuery.where('g.is_active', true);
      } else if (status === 'inactive') {
        countQuery.where('g.is_active', false);
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
          'g.is_active',
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
      // Generate unique business_id
      const businessId = uuidv4();
      // Generate short code and setup identifier
      const { shortCode, setupIdentifier } = await ShortCodeGenerator.generateBusinessSetupCode(data.business_name);
      // Generate required group fields
      const groupName = `${data.business_name} - Main Group`;
      const groupType = 'main';
      const groupId = `main_${businessId}`;
      await database.query('groups').insert({
        business_id: businessId,
        business_name: data.business_name,
        user_id: data.user_id,
        is_active: data.is_active !== undefined ? !!data.is_active : true,
        short_code: shortCode,
        setup_identifier: setupIdentifier,
        group_name: groupName,
        group_type: groupType,
        group_id: groupId
      });
      return {
        business_id: businessId,
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
      const updateData = {
          business_name: data.business_name,
          user_id: data.user_id
      };
      
      // Only update is_active if it's explicitly provided
      if (data.is_active !== undefined) {
        updateData.is_active = !!data.is_active;
      }
      
      await database.query('groups')
        .where('business_id', businessId)
        .update(updateData);
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

  static async toggleUserActive(userId) {
    try {
      const user = await database.query('users').where('id', userId).first();
      if (!user) {
        throw new Error('User not found');
      }
      
      const newStatus = !user.is_active;
      await database.query('users').where('id', userId).update({ is_active: newStatus });
      return { success: true, is_active: newStatus };
    } catch (error) {
      logger.error('Error toggling user active status:', error);
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
      // Check if any group for this business is active
      const anyActive = await database.query('groups')
        .where('business_id', businessId)
        .where('is_active', true)
        .first();
      // If any group is active, deactivate all; otherwise, activate all
      const newStatus = !anyActive;
      await database.query('groups')
        .where('business_id', businessId)
        .update({ is_active: newStatus });
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
      const [userCount, businessCount, orderCount, activeOrderCount, statusCounts] = await Promise.all([
        database.query('users').count('* as count').first(),
        database.query('groups').where('is_active', true).countDistinct('business_id as count').first(),
        database.query('orders').count('* as count').first(),
        database.query('orders').whereIn('status', ['pending', 'processing']).count('* as count').first(),
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
      
      // Get real bot metrics from database
      const botMetrics = await database.query('bot_metrics').orderBy('created_at', 'desc').first();
      
      // Calculate real bot performance metrics
      let messageSuccessRate = 100;
      let avgResponseTime = 0;
      let dailyMessages = 0;
      let lastActivity = null;
      
      if (botMetrics) {
        const total = parseInt(botMetrics.total_messages) || 0;
        const successful = parseInt(botMetrics.successful_messages) || 0;
        messageSuccessRate = total > 0 ? (successful / total) * 100 : 100;
        
        // Parse response times
        let responseTimes = botMetrics.response_times;
        if (typeof responseTimes === 'string') {
          try {
            responseTimes = JSON.parse(responseTimes);
          } catch {
            responseTimes = [];
          }
        }
        if (Array.isArray(responseTimes) && responseTimes.length > 0) {
          avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        }
        
        // Calculate daily messages from daily_counts
        let dailyCounts = botMetrics.daily_counts;
        if (typeof dailyCounts === 'string') {
          try {
            dailyCounts = JSON.parse(dailyCounts);
          } catch {
            dailyCounts = {};
          }
        }
        if (dailyCounts && typeof dailyCounts === 'object') {
          const today = new Date().toISOString().slice(0, 10);
          dailyMessages = dailyCounts[today] || 0;
        }
        
        lastActivity = botMetrics.last_activity;
      }
      
      // Get bot connection status
      const botService = WhatsAppService.getInstance();
      const botInfo = await botService.getBotInfo();
      
      return {
        totalRevenue: '0.00', // Orders table doesn't store pricing information
        totalBusinesses: parseInt(businessCount.count),
        totalOrders: parseInt(orderCount.count),
        totalUsers: parseInt(userCount.count),
        activeOrders: parseInt(activeOrderCount.count),
        orderStatusCounts,
        businessChange,
        orderChange,
        status: botInfo.status || 'disconnected',
        number: botInfo.number || 'Not connected',
        lastActivity: lastActivity || new Date().toISOString(),
        messageSuccessRate: Math.round(messageSuccessRate * 100) / 100, // Round to 2 decimal places
        avgResponseTime: Math.round(avgResponseTime), // Round to nearest integer
        dailyMessages: parseInt(dailyMessages)
      };
    } catch (error) {
      logger.error('Error getting analytics:', error);
      throw error;
    }
  }

  static async getAllUsersWithFilters(name = '', email = '', phone = '') {
    try {
      const query = database.query('users')
        .select('id', 'full_name', 'email', 'phone_number', 'created_at', 'is_active')
        .orderBy('full_name');
      
      if (name) {
        query.where('full_name', 'ilike', `%${name}%`);
      }
      if (email) {
        query.where('email', 'ilike', `%${email}%`);
      }
      if (phone) {
        query.where('phone_number', 'ilike', `%${phone}%`);
      }
      
      return await query;
    } catch (error) {
      logger.error('Error getting all users with filters:', error);
      throw error;
    }
  }

  static async getReportStats({ startDate, endDate, businessId, userId } = {}) {
    try {
      // Businesses
      const businessQuery = database.query('groups');
      if (startDate) businessQuery.where('created_at', '>=', startDate);
      if (endDate) businessQuery.where('created_at', '<=', endDate);
      if (businessId) businessQuery.where('business_id', businessId);
      const totalBusinesses = await businessQuery.clone().countDistinct('business_id as count').first();
      const activeBusinesses = await businessQuery.clone().where('is_active', true).countDistinct('business_id as count').first();
      const newBusinesses = startDate ? await businessQuery.clone().where('created_at', '>=', startDate).countDistinct('business_id as count').first() : { count: 0 };

      // Users
      const userQuery = database.query('users');
      if (startDate) userQuery.where('created_at', '>=', startDate);
      if (endDate) userQuery.where('created_at', '<=', endDate);
      if (userId) userQuery.where('id', userId);
      const totalUsers = await userQuery.clone().count('id as count').first();
      const newUsers = startDate ? await userQuery.clone().where('created_at', '>=', startDate).count('id as count').first() : { count: 0 };

      // Orders
      const orderQuery = database.query('orders');
      if (startDate) orderQuery.where('created_at', '>=', startDate);
      if (endDate) orderQuery.where('created_at', '<=', endDate);
      if (businessId) orderQuery.where('business_id', businessId);
      if (userId) {
        // Get all business IDs for this user
        const userBusinesses = await database.query('groups').select('business_id').where('user_id', userId);
        const businessIds = userBusinesses.map(b => b.business_id);
        if (businessIds.length > 0) orderQuery.whereIn('business_id', businessIds);
      }
      const totalOrders = await orderQuery.clone().count('id as count').first();
      const newOrders = startDate ? await orderQuery.clone().where('created_at', '>=', startDate).count('id as count').first() : { count: 0 };
      // All-time total orders (ignoring filters)
      const totalOrdersAllTime = await database.query('orders').count('id as count').first();

      // Parsing success rate (from bot_metrics)
      const metrics = await database.query('bot_metrics').orderBy('created_at', 'desc').first();
      let parsingSuccessRate = 100, parsingAttempts = 0, parsingSuccesses = 0, parsingFailures = 0, filteredMessages = 0;
      let aiParsedOrders = 0, patternParsedOrders = 0, aiParsedPercent = 0, patternParsedPercent = 0;
      if (metrics) {
        parsingAttempts = metrics.parsing_attempts || 0;
        parsingSuccesses = metrics.parsing_successes || 0;
        parsingFailures = metrics.parsing_failures || 0;
        filteredMessages = metrics.filtered_messages || 0;
        aiParsedOrders = metrics.ai_parsed_orders || 0;
        patternParsedOrders = metrics.pattern_parsed_orders || 0;
        const totalParsed = aiParsedOrders + patternParsedOrders;
        aiParsedPercent = totalParsed > 0 ? (aiParsedOrders / totalParsed) * 100 : 0;
        patternParsedPercent = totalParsed > 0 ? (patternParsedOrders / totalParsed) * 100 : 0;
        parsingSuccessRate = parsingAttempts > 0 ? (parsingSuccesses / parsingAttempts) * 100 : 100;
      }

      return {
        totalBusinesses: parseInt(totalBusinesses.count) || 0,
        activeBusinesses: parseInt(activeBusinesses.count) || 0,
        newBusinesses: parseInt(newBusinesses.count) || 0,
        totalUsers: parseInt(totalUsers.count) || 0,
        newUsers: parseInt(newUsers.count) || 0,
        totalOrders: parseInt(totalOrders.count) || 0,
        newOrders: parseInt(newOrders.count) || 0,
        totalOrdersAllTime: parseInt(totalOrdersAllTime.count) || 0,
        parsingSuccessRate,
        parsingAttempts,
        parsingSuccesses,
        parsingFailures,
        filteredMessages,
        aiParsedOrders,
        patternParsedOrders,
        aiParsedPercent,
        patternParsedPercent
      };
    } catch (error) {
      logger.error('Error getting report stats:', error);
      throw error;
    }
  }

  static async getParsingSuccessTimeSeries(days = 14) {
    try {
      const results = [];
      const today = new Date();
      // Get the latest bot_metrics row (should have the JSON field)
      const metrics = await database.query('bot_metrics').orderBy('created_at', 'desc').first();
      let parsingMetricsByDay = {};
      if (metrics && metrics.parsing_metrics_by_day) {
        if (typeof metrics.parsing_metrics_by_day === 'string') {
          try { parsingMetricsByDay = JSON.parse(metrics.parsing_metrics_by_day); } catch { parsingMetricsByDay = {}; }
        } else {
          parsingMetricsByDay = metrics.parsing_metrics_by_day;
        }
      }
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateStr = date.toISOString().slice(0, 10);
        let rate = 100;
        if (parsingMetricsByDay[dateStr]) {
          const { attempts, successes } = parsingMetricsByDay[dateStr];
          rate = attempts > 0 ? (successes / attempts) * 100 : 100;
        } else {
          rate = 0; // No data for this day
        }
        results.push({ date: dateStr, rate });
      }
      return results;
    } catch (error) {
      logger.error('Error getting parsing success time series:', error);
      return [];
    }
  }

  static async getRecentActivity(limit = 5) {
    try {
      const activities = [];
      
      // Get recent orders
      const recentOrders = await database.query('orders as o')
        .select(
          'o.id',
          'o.order_id',
          'o.customer_name',
          'o.status',
          'o.created_at',
          'g.business_name'
        )
        .leftJoin('groups as g', 'o.business_id', 'g.business_id')
        .orderBy('o.created_at', 'desc')
        .limit(limit);
      
      // Get recent business registrations
      const recentBusinesses = await database.query('groups as g')
        .select(
          'g.business_id',
          'g.business_name',
          'g.created_at',
          'u.full_name as owner_name'
        )
        .leftJoin('users as u', 'g.user_id', 'u.id')
        .orderBy('g.created_at', 'desc')
        .limit(limit);
      
      // Get recent user registrations
      const recentUsers = await database.query('users')
        .select('id', 'full_name', 'email', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(limit);
      
      // Combine and sort all activities
      const allActivities = [
        ...recentOrders.map(order => ({
          type: 'order',
          title: 'New order received',
          description: `Order #${order.order_id} from ${order.customer_name} (${order.business_name})`,
          time: order.created_at,
          icon: 'box'
        })),
        ...recentBusinesses.map(business => ({
          type: 'business',
          title: 'New business registered',
          description: `${business.business_name} joined the platform`,
          time: business.created_at,
          icon: 'building'
        })),
        ...recentUsers.map(user => ({
          type: 'user',
          title: 'New user registered',
          description: `${user.full_name} (${user.email}) joined`,
          time: user.created_at,
          icon: 'user'
        }))
      ];
      
      // Sort by time and take the most recent
      allActivities.sort((a, b) => new Date(b.time) - new Date(a.time));
      
      return allActivities.slice(0, limit);
    } catch (error) {
      logger.error('Error getting recent activity:', error);
      return [];
    }
  }
}

module.exports = AdminService; 