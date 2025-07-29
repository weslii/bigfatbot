// src/routes/api.routes.js
const express = require('express');
const router = express.Router();
const apiController = require('../controllers/api.controller');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth.middleware');

// Health check endpoint
router.get('/health', apiController.healthCheck);

// Memory usage endpoint for monitoring
router.get('/memory', apiController.getMemoryUsage);

// Bot management endpoints (support both WhatsApp and Telegram)
router.get('/bot-info', apiController.getBotInfo);
router.post('/whatsapp/change-number', apiController.changeNumber);
router.post('/restart', requireAdmin, apiController.restartBot);
router.get('/qr', requireSuperAdmin, apiController.getQrCode);

// Telegram webhook endpoint
router.post('/telegram-webhook', apiController.handleTelegramWebhook);

// Order management API endpoints
router.get('/orders/:orderId', apiController.getOrderDetails);
router.post('/orders/:orderId/status', apiController.updateOrderStatus);
router.delete('/orders/:orderId', apiController.deleteOrder);
router.put('/orders/:orderId', apiController.updateOrder);
router.get('/orders/count', apiController.getOrderCount);

// Groups API endpoints
router.post('/groups', apiController.addGroup);
router.get('/groups/:groupId', apiController.getGroup);
router.delete('/groups/:groupId', apiController.deleteGroup);

// Business API endpoints
router.post('/businesses', apiController.createBusiness);
router.put('/businesses/:businessId', apiController.updateBusiness);
router.delete('/businesses/:businessId', apiController.deleteBusiness);

// Settings API endpoints
router.put('/settings/profile', apiController.updateProfile);
router.put('/settings/password', apiController.changePassword);
router.put('/settings/notifications', apiController.updateNotifications);

// Export functionality
router.get('/export/orders', apiController.exportOrders);

module.exports = router; 