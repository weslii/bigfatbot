const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth.middleware');

// Debug routes
router.get('/debug-session', adminController.debugSession);
router.get('/test-session', adminController.testSession);

// Authentication
router.get('/login', adminController.renderLogin);
router.post('/login', adminController.handleLogin);
router.get('/logout', adminController.handleLogout);

// Dashboard
router.get('/dashboard', requireAdmin, adminController.renderDashboard);
router.get('/preview-dashboard', requireAdmin, adminController.renderPreviewDashboard);

// Orders Management
router.get('/orders', requireAdmin, adminController.listOrders);
router.post('/orders/:orderId/complete', requireAdmin, adminController.completeOrder);
router.post('/orders/:orderId/delete', requireAdmin, adminController.deleteOrder);
router.get('/orders/:orderId/edit', requireAdmin, adminController.renderEditOrder);
router.post('/orders/:orderId/edit', requireAdmin, adminController.handleEditOrder);

// Business Management
router.get('/businesses', requireAdmin, adminController.listBusinesses);
router.get('/businesses/add', requireAdmin, adminController.renderAddBusiness);
router.post('/businesses/add', requireAdmin, adminController.handleAddBusiness);
router.get('/businesses/:businessId/edit', requireAdmin, adminController.renderEditBusiness);
router.post('/businesses/:businessId/edit', requireAdmin, adminController.handleEditBusiness);
router.post('/api/businesses/:businessId/toggle', requireAdmin, adminController.toggleBusinessActive);
router.post('/businesses/:businessId/delete', requireAdmin, adminController.deleteBusiness);
router.get('/businesses/:businessId', requireAdmin, adminController.renderBusinessDetails);

// User Management
router.get('/users', requireAdmin, adminController.listUsers);
router.get('/users/add', requireAdmin, adminController.renderAddUser);
router.post('/users/add', requireAdmin, adminController.handleAddUser);
router.get('/users/:userId/edit', requireAdmin, adminController.renderEditUser);
router.post('/users/:userId/edit', requireAdmin, adminController.handleEditUser);
router.post('/users/:userId/delete', requireAdmin, adminController.deleteUser);
router.post('/api/users/:userId/toggle', requireAdmin, adminController.toggleUserActive);

// Admin Management
router.get('/admins', requireAdmin, adminController.listAdmins);
router.get('/admins/add', requireAdmin, adminController.renderAddAdmin);
router.post('/admins/add', requireAdmin, adminController.handleAddAdmin);
router.get('/admins/:adminId/edit', requireAdmin, adminController.renderEditAdmin);
router.post('/admins/:adminId/edit', requireAdmin, adminController.handleEditAdmin);
router.post('/admins/:adminId/toggle', requireAdmin, adminController.toggleAdminActive);
router.post('/admins/:adminId/delete', requireAdmin, adminController.deleteAdmin);

// Reports
router.get('/reports', requireAdmin, adminController.renderReports);
router.get('/api/reports', requireAdmin, adminController.getReportStats);
router.get('/api/reports/parsing-time-series', requireAdmin, adminController.getParsingTimeSeries);

// API endpoints
router.get('/api/businesses', requireAdmin, adminController.getApiBusinesses);
router.get('/api/orders', requireAdmin, adminController.getApiOrders);
router.get('/api/orders/:orderId', requireAdmin, adminController.getApiOrderDetails);
router.get('/api/analytics', requireAdmin, adminController.getApiAnalytics);
router.get('/api/users', requireAdmin, adminController.getApiUsers);

// Export functionality
router.get('/api/export/businesses', requireAdmin, adminController.exportBusinesses);
router.get('/api/export/orders', requireAdmin, adminController.exportOrders);

module.exports = router; 