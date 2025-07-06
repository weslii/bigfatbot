const RegistrationService = require('../services/RegistrationService');
const OrderService = require('../services/OrderService');
const logger = require('../utils/logger');
const db = require('../config/database');

module.exports = {
  // Landing pages
  renderLanding: (req, res) => {
    res.render('preview-landing');
  },

  renderLandingPreview: (req, res) => {
    res.render('landing-preview');
  },

  renderPreviewLanding: (req, res) => {
    res.render('preview-landing');
  },

  // Dashboard
  renderDashboard: async (req, res) => {
    try {
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.redirect('/login');
      }

      // Check if user is active
      const user = await db.query('users').where('id', userId).select('is_active').first();
      if (!user || !user.is_active) {
        req.session.destroy();
        return res.render('error', { error: 'Your account has been deactivated. Please contact support.' });
      }

      // Updated query to get businesses with order counts
      const businessesWithOrders = await db.query('groups as g')
        .select(
          'g.business_id', 
          'g.business_name', 
          db.query.raw('MIN(g.created_at) as created_at'),
          db.query.raw('MAX(g.is_active::int) as is_active'),
          db.query.raw('COUNT(DISTINCT o.id) as order_count')
        )
        .leftJoin('orders as o', 'g.business_id', 'o.business_id')
        .where('g.user_id', userId)
        .groupBy('g.business_id', 'g.business_name');
      
      const [groups, orderStats, recentOrders] = await Promise.all([
        RegistrationService.getUserGroups(userId),
        OrderService.getUserOrderStats(userId),
        OrderService.getUserRecentOrders(userId, 5)
      ]);
      
      res.render('dashboard', { 
        groups, 
        businesses: businessesWithOrders,
        userId, 
        orderStats, 
        recentOrders 
      });
    } catch (error) {
      logger.error('Dashboard error:', error);
      res.render('error', { error: 'Failed to load dashboard.' });
    }
  },

  // Add business
  renderAddBusiness: (req, res) => {
    const userId = req.session && req.session.userId ? String(req.session.userId) : req.query.userId;
    if (!userId) {
      return res.redirect('/register');
    }
    res.render('add-business', { userId });
  },

  handleAddBusiness: async (req, res) => {
    try {
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      const { businessName } = req.body;
      logger.info('Add business for userId:', userId);
      if (!userId) {
        return res.redirect('/login');
      }
      const result = await RegistrationService.addBusinessToUser(userId, businessName);
      // Redirect to group setup page for the new business
      res.redirect(`/setup-group?businessId=${result.businessId}&userId=${userId}`);
    } catch (error) {
      logger.error('Add business error:', error);
      res.render('add-business', { 
        error: 'Failed to add business. Please try again.',
        userId: req.session && req.session.userId ? String(req.session.userId) : null
      });
    }
  },

  // Groups page
  renderGroups: async (req, res) => {
    try {
      const userId = req.session ? req.session.userId : null;
      if (!userId) {
        return res.redirect('/login');
      }

      // Get user's businesses
      const businesses = await db.query('groups')
        .select('business_id', 'business_name', 'setup_identifier')
        .where('user_id', userId)
        .groupBy('business_id', 'business_name', 'setup_identifier');

      // Get user's groups
      const groups = await db.query('groups')
        .where('user_id', userId)
        .whereNot('group_type', 'main')
        .orderBy('created_at', 'desc');

      res.render('groups', {
        userId,
        businesses,
        groups
      });
    } catch (error) {
      logger.error('Groups page error:', error);
      res.status(500).render('error', { error: 'Failed to load groups page' });
    }
  },

  // Settings page
  renderSettings: async (req, res) => {
    try {
      const userId = req.session ? req.session.userId : null;
      if (!userId) {
        return res.redirect('/login');
      }

      // Get user data
      const user = await db.query('users')
        .where('id', userId)
        .first();

      if (!user) {
        return res.redirect('/login');
      }

      // Get user's businesses
      const businesses = await db.query('groups')
        .select('business_id', 'business_name', 'created_at')
        .where('user_id', userId)
        .groupBy('business_id', 'business_name', 'created_at');

      // Get user's groups
      const groups = await db.query('groups')
        .where('user_id', userId);

      // Get user's orders for business stats
      const orders = await db.query('orders as o')
        .select('o.*', 'g.business_id')
        .join('groups as g', 'o.business_id', 'g.business_id')
        .where('g.user_id', userId);

      res.render('settings', {
        userId,
        user,
        businesses,
        groups,
        orders
      });
    } catch (error) {
      logger.error('Settings page error:', error);
      res.status(500).render('error', { error: 'Failed to load settings page' });
    }
  },

  // Setup group
  renderSetupGroup: async (req, res) => {
    try {
      const userId = req.session ? req.session.userId : null;
      if (!userId) {
        return res.redirect('/login');
      }

      const { businessId } = req.query;
      if (!businessId) {
        return res.redirect('/dashboard');
      }

      // Get business details
      const business = await db.query('groups')
        .select('business_id', 'business_name', 'setup_identifier')
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

      res.render('setup-group', {
        userId,
        business,
        businessGroups
      });
    } catch (error) {
      logger.error('Setup group page error:', error);
      res.status(500).render('error', { error: 'Failed to load setup group page' });
    }
  }
}; 