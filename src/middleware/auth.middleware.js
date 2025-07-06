const AdminService = require('../services/AdminService');
const logger = require('../utils/logger');
const db = require('../config/database');

module.exports = {
  requireUser: async (req, res, next) => {
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

    req.user = user;
    next();
  },

  requireAdmin: async (req, res, next) => {
    // console.log('requireAdmin middleware - Session:', req.session);
    // console.log('requireAdmin middleware - Session ID:', req.sessionID);
    // console.log('requireAdmin middleware - Session adminId:', req.session ? req.session.adminId : undefined);
    // console.log('requireAdmin middleware - Session isAuthenticated:', req.session ? req.session.isAuthenticated : undefined);
    
    if (!req.session || !req.session.adminId || !req.session.isAuthenticated) {
      // console.log('requireAdmin middleware - Authentication failed');
      return res.redirect('/admin/login');
    }
    
    try {
      const admin = await AdminService.getAdminById(req.session.adminId);
      // console.log('requireAdmin middleware - Admin lookup result:', admin);
      
      if (!admin || !admin.is_active) {
        // console.log('requireAdmin middleware - Admin not found or inactive');
        req.session.destroy((err) => {
          if (err) {
            console.error('Error destroying session:', err);
          }
          res.redirect('/admin/login');
        });
        return;
      }
      
      req.admin = admin;
      next();
    } catch (error) {
      logger.error('Admin auth error:', error);
      res.redirect('/admin/login');
    }
  },

  requireSuperAdmin: async (req, res, next) => {
    if (!req.session || !req.session.adminId || !req.session.isAuthenticated) {
      return res.status(403).json({ error: 'Superadmin access required' });
    }
    try {
      const admin = await AdminService.getAdminById(req.session.adminId);
      if (!admin || !admin.is_active || admin.role !== 'super_admin') {
        return res.status(403).json({ error: 'Superadmin access required' });
      }
      req.admin = admin;
      next();
    } catch (error) {
      logger.error('Superadmin auth error:', error);
      res.status(403).json({ error: 'Superadmin access required' });
    }
  },

  requireUser: async (req, res, next) => {
    const userId = req.session && req.session.userId ? String(req.session.userId) : null;
    
    if (!userId) {
      return res.redirect('/login');
    }

    try {
      // Check if user is active
      const user = await db.query('users').where('id', userId).select('is_active').first();
      if (!user || !user.is_active) {
        req.session.destroy();
        return res.render('error', { error: 'Your account has been deactivated. Please contact support.' });
      }

      req.user = user;
      req.userId = userId;
      next();
    } catch (error) {
      logger.error('User auth error:', error);
      res.redirect('/login');
    }
  }
}; 