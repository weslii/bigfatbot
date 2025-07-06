const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');

// Orders page for users
router.get('/orders', orderController.renderOrders);

// Export functionality
router.get('/export/orders', orderController.exportOrders);

module.exports = router; 