const logger = require('../utils/logger');
const db = require('../config/database');

module.exports = {
  // Business management routes
  renderBusiness: async (req, res) => {
    try {
      const userId = req.session ? req.session.userId : null;
      if (!userId) {
        return res.redirect('/login');
      }

      const { businessId } = req.params;

      // Get business details with all necessary fields
      const business = await db.query('groups')
        .select('business_id', 'business_name', 'created_at', 'setup_identifier')
        .where('business_id', businessId)
        .where('user_id', userId)
        .first();

      if (!business) {
        return res.status(404).render('error', { error: 'Business not found' });
      }

      // Get business groups
      const businessGroups = await db.query('groups')
        .select('id', 'group_name', 'group_id', 'group_type', 'created_at')
        .where('business_id', businessId)
        .orderBy('created_at', 'desc');

      // Get business orders for stats
      const businessOrders = await db.query('orders')
        .where('business_id', businessId);

      // Calculate business stats
      const businessStats = {
        totalOrders: businessOrders.length,
        completedOrders: businessOrders.filter(o => o.status === 'delivered').length,
        pendingOrders: businessOrders.filter(o => o.status === 'pending').length
      };

      // Get recent orders
      const recentOrders = await db.query('orders')
        .select('id', 'order_id', 'customer_name', 'items', 'status', 'created_at')
        .where('business_id', businessId)
        .orderBy('created_at', 'desc')
        .limit(10);

      res.render('business', {
        userId,
        business,
        businessGroups,
        businessStats,
        recentOrders
      });
    } catch (error) {
      logger.error('Business page error:', error);
      res.status(500).render('error', { error: 'Failed to load business page' });
    }
  },

  renderAddBusiness: async (req, res) => {
    try {
      const userId = req.session ? req.session.userId : null;
      if (!userId) {
        return res.redirect('/login');
      }

      res.render('business', {
        userId,
        business: null
      });
    } catch (error) {
      logger.error('Add business page error:', error);
      res.status(500).render('error', { error: 'Failed to load add business page' });
    }
  }
}; 