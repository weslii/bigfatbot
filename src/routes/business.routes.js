const express = require('express');
const router = express.Router();
const businessController = require('../controllers/business.controller');

// Business management routes
router.get('/business/:businessId', businessController.renderBusiness);
router.get('/business/add', businessController.renderAddBusiness);

module.exports = router; 