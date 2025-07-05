const AdminService = require('../services/AdminService');
const logger = require('../utils/logger');

// Admin authentication middleware
const requireAdmin = async (req, res, next) => {
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
};

// Superadmin authentication middleware
const requireSuperAdmin = async (req, res, next) => {
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
};

module.exports = {
  requireAdmin,
  requireSuperAdmin
}; 