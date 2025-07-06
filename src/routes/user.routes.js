const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');

// Landing pages
router.get('/', userController.renderLanding);
router.get('/landing-preview', userController.renderLandingPreview);
router.get('/preview-landing', userController.renderPreviewLanding);

// Dashboard
router.get('/dashboard', userController.renderDashboard);

// Add business
router.get('/add-business', userController.renderAddBusiness);
router.post('/add-business', userController.handleAddBusiness);

// Groups page
router.get('/groups', userController.renderGroups);

// Settings page
router.get('/settings', userController.renderSettings);

// Setup group
router.get('/setup-group', userController.renderSetupGroup);

module.exports = router; 