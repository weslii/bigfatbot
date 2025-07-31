const database = require('../config/database');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');
const ShortCodeGenerator = require('../utils/shortCodeGenerator');
const BotServiceManager = require('./BotServiceManager');
const { v4: uuidv4 } = require('uuid');
const NotificationService = require('./NotificationService');

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
      if (data.password) {
        data.password_hash = await bcrypt.hash(data.password, 10);
        delete data.password;
      }

      const [admin] = await database.query('admins')
        .where('id', id)
        .update(data)
        .returning('*');

      return admin;
    } catch (error) {
      logger.error('Error updating admin:', error);
      throw error;
    }
  }

  static async getAllOrdersWithDetails({ status, business, search, limit = 5, offset = 0 } = {}) {
    try {
      // Build base query for filtering
      let baseQuery = database.query('orders as o')
        .leftJoin('groups as g', 'o.business_id', 'g.business_id')
        .leftJoin('users as u', 'g.user_id', 'u.id');

      if (status) {
        baseQuery = baseQuery.where('o.status', status);
      }

      if (business) {
        baseQuery = baseQuery.where('g.business_name', 'ilike', `%${business}%`);
      }

      if (search) {
        baseQuery = baseQuery.where(function() {
          this.where('o.customer_name', 'ilike', `%${search}%`)
            .orWhere('o.order_id', 'ilike', `%${search}%`)
            .orWhere('o.customer_phone', 'ilike', `%${search}%`);
        });
      }

      // Get total count
      const total = await baseQuery.clone().count('o.id as count').first();

      // Get orders with details
      const orders = await baseQuery
        .select(
          'o.*',
          'g.business_name',
          'u.full_name as customer_name'
        )
        .orderBy('o.created_at', 'desc')
        .limit(limit)
        .offset(offset);

      return {
        orders,
        total: parseInt(total.count),
        limit,
        offset
      };
    } catch (error) {
      logger.error('Error getting all orders with details:', error);
      throw error;
    }
  }

  static async markOrderCompleted(orderId) {
    try {
      const [order] = await database.query('orders')
        .where('id', orderId)
        .update({
          status: 'delivered',
          delivered_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');

      return order;
    } catch (error) {
      logger.error('Error marking order completed:', error);
      throw error;
    }
  }

  static async deleteOrder(orderId) {
    try {
      await database.query('orders')
        .where('id', orderId)
        .del();
    } catch (error) {
      logger.error('Error deleting order:', error);
      throw error;
    }
  }

  static async getOrderById(orderId) {
    try {
      return await database.query('orders as o')
        .select(
          'o.*',
          'g.business_name',
          'u.full_name as customer_name'
        )
        .leftJoin('groups as g', 'o.business_id', 'g.business_id')
        .leftJoin('users as u', 'g.user_id', 'u.id')
        .where('o.id', orderId)
        .first();
    } catch (error) {
      logger.error('Error getting order by ID:', error);
      throw error;
    }
  }

  static async editOrder(orderId, data) {
    try {
      const [order] = await database.query('orders')
        .where('id', orderId)
        .update({
          ...data,
          updated_at: new Date()
        })
        .returning('*');

      return order;
    } catch (error) {
      logger.error('Error editing order:', error);
      throw error;
    }
  }

  static async getAllBusinessesWithOwners(limit = 10, offset = 0, search = '', business_name = '', owner = '', status = '') {
    try {
      // Build base query for filtering
      let baseQuery = database.query('groups as g')
        .leftJoin('users as u', 'g.user_id', 'u.id');

      if (search) {
        baseQuery = baseQuery.where(function() {
          this.where('g.business_name', 'ilike', `%${search}%`)
            .orWhere('u.full_name', 'ilike', `%${search}%`);
        });
      }

      if (business_name) {
        baseQuery = baseQuery.where('g.business_name', 'ilike', `%${business_name}%`);
      }

      if (owner) {
        baseQuery = baseQuery.where('u.full_name', 'ilike', `%${owner}%`);
      }

      if (status) {
        baseQuery = baseQuery.where('g.is_active', status === 'active');
      }

      // Get total count of distinct businesses
      const total = await baseQuery.clone().countDistinct('g.business_id as count').first();

      // Get businesses with details
      const businesses = await baseQuery
        .select(
          'g.business_id',
          'g.business_name',
          'g.group_type',
          'g.is_active',
          'g.created_at',
          'u.full_name as owner_name',
          'u.email as owner_email'
        )
        .distinct('g.business_id')
        .orderBy('g.created_at', 'desc')
        .limit(limit)
        .offset(offset);

      return {
        businesses,
        total: parseInt(total.count),
        limit,
        offset
      };
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
          'g.group_type',
          'g.is_active',
          'g.created_at',
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
      const [business] = await database.query('groups')
        .insert({
          user_id: data.user_id,
          business_id: uuidv4(),
          business_name: data.business_name,
          group_name: data.group_name,
          group_id: data.group_id,
          group_type: data.group_type,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');

      return business;
    } catch (error) {
      logger.error('Error adding business:', error);
      throw error;
    }
  }

  static async editBusiness(businessId, data) {
    try {
      const [business] = await database.query('groups')
        .where('business_id', businessId)
        .update({
          ...data,
          updated_at: new Date()
        })
        .returning('*');

      return business;
    } catch (error) {
      logger.error('Error editing business:', error);
      throw error;
    }
  }

  static async deleteBusiness(businessId, reason = null) {
    try {
      // Get business details for notification
      const business = await this.getBusinessById(businessId);
      
      // Delete all groups for this business
      await database.query('groups')
        .where('business_id', businessId)
        .del();

      // Delete all orders for this business
      await database.query('orders')
        .where('business_id', businessId)
        .del();

      // Send notification
      if (business) {
        await NotificationService.notifyBusinessDeletion(
          business,
          { full_name: 'Admin', email: 'admin@novi.com' },
          'Admin',
          reason
        );
      }

      return true;
    } catch (error) {
      logger.error('Error deleting business:', error);
      throw error;
    }
  }

  static async getAllUsers() {
    try {
      return await database.query('users')
        .select('id', 'full_name', 'email', 'phone_number', 'created_at', 'is_active')
        .orderBy('full_name');
    } catch (error) {
      logger.error('Error getting all users:', error);
      throw error;
    }
  }

  static async getUserById(userId) {
    try {
      return await database.query('users')
        .where('id', userId)
        .first();
    } catch (error) {
      logger.error('Error getting user by ID:', error);
      throw error;
    }
  }

  static async addUser(data) {
    try {
      const [user] = await database.query('users')
        .insert({
          ...data,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');

      return user;
    } catch (error) {
      logger.error('Error adding user:', error);
      throw error;
    }
  }

  static async editUser(userId, data) {
    try {
      const [user] = await database.query('users')
        .where('id', userId)
        .update({
          ...data,
          updated_at: new Date()
        })
        .returning('*');

      return user;
    } catch (error) {
      logger.error('Error editing user:', error);
      throw error;
    }
  }

  static async deleteUser(userId, reason = null) {
    try {
      // Get user details for notification
      const user = await this.getUserById(userId);
      
      // Check if user has any businesses
      const userBusinesses = await database.query('groups')
        .where('user_id', userId)
        .select('business_id', 'business_name');

      if (userBusinesses.length > 0) {
        // Delete all businesses owned by this user
        for (const business of userBusinesses) {
          await this.deleteBusiness(business.business_id, `User deletion: ${reason}`);
        }
      }

      // Delete all groups owned by this user
      await database.query('groups')
        .where('user_id', userId)
        .del();

      // Delete the user
      await database.query('users')
        .where('id', userId)
        .del();

      // Send notification
      if (user) {
        await NotificationService.notifyUserDeletion(
          user,
          'Admin',
          reason
        );
      }

      return true;
    } catch (error) {
      logger.error('Error deleting user:', error);
      throw error;
    }
  }

  static async toggleUserActive(userId, reason = null) {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const newStatus = !user.is_active;
      
      await database.query('users')
        .where('id', userId)
        .update({
          is_active: newStatus,
          updated_at: new Date()
        });

      // Also update all groups owned by this user
      await database.query('groups')
        .where('user_id', userId)
        .update({
          is_active: newStatus,
          updated_at: new Date()
        });

      // Send notification
      if (newStatus) {
        await NotificationService.notifyUserActivation(user, 'Admin');
      } else {
        await NotificationService.notifyUserDeactivation(user, 'Admin', reason);
      }

      return { is_active: newStatus };
    } catch (error) {
      logger.error('Error toggling user active status:', error);
      throw error;
    }
  }

  static async getAllAdmins() {
    try {
      return await database.query('admins')
        .select('id', 'username', 'email', 'role', 'created_at', 'last_login')
        .orderBy('username');
    } catch (error) {
      logger.error('Error getting all admins:', error);
      throw error;
    }
  }

  static async addAdmin(data) {
    try {
      const [admin] = await database.query('admins')
        .insert({
          ...data,
          created_at: new Date()
        })
        .returning('*');

      return admin;
    } catch (error) {
      logger.error('Error adding admin:', error);
      throw error;
    }
  }

  static async editAdmin(adminId, data) {
    try {
      const [admin] = await database.query('admins')
        .where('id', adminId)
        .update({
          ...data,
          updated_at: new Date()
        })
        .returning('*');

      return admin;
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

      if (!admin) {
        throw new Error('Admin not found');
      }

      const newStatus = !admin.is_active;
      
      await database.query('admins')
        .where('id', adminId)
        .update({
          is_active: newStatus,
          updated_at: new Date()
        });

      return { is_active: newStatus };
    } catch (error) {
      logger.error('Error toggling admin active status:', error);
      throw error;
    }
  }

  static async deleteAdmin(adminId) {
    try {
      await database.query('admins')
        .where('id', adminId)
        .del();
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

      if (!business) {
        throw new Error('Business not found');
      }

      const newStatus = !business.is_active;
      
      await database.query('groups')
        .where('business_id', businessId)
        .update({
          is_active: newStatus,
          updated_at: new Date()
        });

      return { is_active: newStatus };
    } catch (error) {
      logger.error('Error toggling business active status:', error);
      throw error;
    }
  }

  static async getPercentageChange(table, column = '*') {
    try {
      const now = new Date();
      const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const [todayCount, yesterdayCount] = await Promise.all([
        database.query(table).where('created_at', '>=', now.toISOString().split('T')[0]).count(column + ' as count').first(),
        database.query(table).where('created_at', '>=', yesterdayDate.toISOString().split('T')[0]).where('created_at', '<', now.toISOString().split('T')[0]).count(column + ' as count').first()
      ]);

      const today = parseInt(todayCount.count);
      const yesterday = parseInt(yesterdayCount.count);
      
      if (yesterday === 0) {
        return today > 0 ? 100 : 0;
      }
      
      return ((today - yesterday) / yesterday) * 100;
    } catch (error) {
      logger.error('Error calculating percentage change:', error);
      return 0;
    }
  }

  static async getBotManagementMetrics() {
    try {
      const botManager = BotServiceManager.getInstance();
      const metrics = await botManager.getBotMetrics('all');
      return metrics;
    } catch (error) {
      logger.error('Error getting bot management metrics:', error);
      return null;
    }
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
      
      // Get bot connection status from BotServiceManager
      const botManager = BotServiceManager.getInstance();
      const botInfo = await botManager.getBotInfo('all');
      
      // Determine overall status
      let overallStatus = 'disconnected';
      let overallNumber = 'Not connected';
      
      if (botInfo.whatsapp && botInfo.telegram) {
        if (botInfo.whatsapp.status === 'connected' && botInfo.telegram.status === 'connected') {
          overallStatus = 'connected';
          overallNumber = 'Both platforms connected';
        } else if (botInfo.whatsapp.status === 'connected') {
          overallStatus = 'connected';
          overallNumber = `WhatsApp: ${botInfo.whatsapp.number}`;
        } else if (botInfo.telegram.status === 'connected') {
          overallStatus = 'connected';
          overallNumber = `Telegram: ${botInfo.telegram.number}`;
        }
      } else if (botInfo.whatsapp) {
        overallStatus = botInfo.whatsapp.status;
        overallNumber = botInfo.whatsapp.number;
      } else if (botInfo.telegram) {
        overallStatus = botInfo.telegram.status;
        overallNumber = botInfo.telegram.number;
      }
      
      return {
        totalRevenue: '23,584.89', // Placeholder value for dashboard
        totalBusinesses: parseInt(businessCount.count),
        totalOrders: parseInt(orderCount.count),
        totalUsers: parseInt(userCount.count),
        activeOrders: parseInt(activeOrderCount.count),
        orderStatusCounts,
        businessChange,
        orderChange,
        status: overallStatus,
        number: overallNumber,
        lastActivity: lastActivity || new Date().toISOString(),
        messageSuccessRate: Math.round(messageSuccessRate * 100) / 100, // Round to 2 decimal places
        avgResponseTime: Math.round((avgResponseTime / 1000) * 10) / 10, // Convert ms to seconds, round to 1 decimal
        dailyMessages: parseInt(dailyMessages),
        // Add platform-specific info
        whatsapp: botInfo.whatsapp || { status: 'disconnected', number: 'Not connected' },
        telegram: botInfo.telegram || { status: 'disconnected', number: 'Not connected' }
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
      let query = database.query('orders as o')
        .select(
          'o.*',
          'g.business_name',
          'u.full_name as customer_name'
        )
        .leftJoin('groups as g', 'o.business_id', 'g.business_id')
        .leftJoin('users as u', 'g.user_id', 'u.id');

      if (startDate && endDate) {
        query = query.whereBetween('o.created_at', [startDate, endDate]);
      }

      if (businessId) {
        query = query.where('o.business_id', businessId);
      }

      if (userId) {
        query = query.where('g.user_id', userId);
      }

      const orders = await query.orderBy('o.created_at', 'desc');

      // Calculate statistics
      const totalOrders = orders.length;
      const totalRevenue = orders.reduce((sum, order) => sum + (parseFloat(order.total_amount) || 0), 0);
      const pendingOrders = orders.filter(order => order.status === 'pending').length;
      const deliveredOrders = orders.filter(order => order.status === 'delivered').length;
      const cancelledOrders = orders.filter(order => order.status === 'cancelled').length;

      // Group by status
      const statusCounts = {};
      orders.forEach(order => {
        statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
      });

      // Group by business
      const businessStats = {};
      orders.forEach(order => {
        const businessName = order.business_name || 'Unknown';
        if (!businessStats[businessName]) {
          businessStats[businessName] = {
            totalOrders: 0,
            totalRevenue: 0,
            pendingOrders: 0,
            deliveredOrders: 0,
            cancelledOrders: 0
          };
        }
        businessStats[businessName].totalOrders++;
        businessStats[businessName].totalRevenue += parseFloat(order.total_amount) || 0;
        if (order.status === 'pending') businessStats[businessName].pendingOrders++;
        if (order.status === 'delivered') businessStats[businessName].deliveredOrders++;
        if (order.status === 'cancelled') businessStats[businessName].cancelledOrders++;
      });

      return {
        totalOrders,
        totalRevenue,
        pendingOrders,
        deliveredOrders,
        cancelledOrders,
        statusCounts,
        businessStats,
        orders
      };
    } catch (error) {
      logger.error('Error getting report stats:', error);
      throw error;
    }
  }

  static async getParsingSuccessTimeSeries(days = 14) {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

      const metrics = await database.query('bot_metrics')
        .where('created_at', '>=', startDate.toISOString())
        .where('created_at', '<=', endDate.toISOString())
        .orderBy('created_at', 'asc');

      const timeSeries = [];
      for (let i = 0; i < days; i++) {
        const date = new Date(startDate.getTime() + (i * 24 * 60 * 60 * 1000));
        const dateStr = date.toISOString().split('T')[0];
        
        const dayMetrics = metrics.filter(m => 
          m.created_at.toISOString().split('T')[0] === dateStr
        );

        const totalMessages = dayMetrics.reduce((sum, m) => sum + (parseInt(m.total_messages) || 0), 0);
        const successfulParses = dayMetrics.reduce((sum, m) => sum + (parseInt(m.successful_parses) || 0), 0);
        const successRate = totalMessages > 0 ? (successfulParses / totalMessages) * 100 : 0;

        timeSeries.push({
          date: dateStr,
          totalMessages,
          successfulParses,
          successRate: Math.round(successRate * 100) / 100
        });
      }

      return timeSeries;
    } catch (error) {
      logger.error('Error getting parsing success time series:', error);
      return [];
    }
  }

  static async getRecentActivity(limit = 5) {
    try {
      const activities = [];

      // Get recent orders
      const recentOrders = await database.query('orders')
        .select('id', 'order_id', 'customer_name', 'status', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(limit);

      recentOrders.forEach(order => {
        activities.push({
          type: 'order',
          id: order.id,
          title: `New order #${order.order_id}`,
          description: `Order from ${order.customer_name}`,
          status: order.status,
          timestamp: order.created_at
        });
      });

      // Get recent user registrations
      const recentUsers = await database.query('users')
        .select('id', 'full_name', 'email', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(limit);

      recentUsers.forEach(user => {
        activities.push({
          type: 'user',
          id: user.id,
          title: `New user registered`,
          description: `${user.full_name} (${user.email})`,
          status: 'active',
          timestamp: user.created_at
        });
      });

      // Get recent business additions
      const recentBusinesses = await database.query('groups')
        .select('business_id', 'business_name', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(limit);

      recentBusinesses.forEach(business => {
        activities.push({
          type: 'business',
          id: business.business_id,
          title: `New business added`,
          description: business.business_name,
          status: 'active',
          timestamp: business.created_at
        });
      });

      // Sort by timestamp and return top limit
      return activities
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
    } catch (error) {
      logger.error('Error getting recent activity:', error);
      return [];
    }
  }
}

module.exports = AdminService; 