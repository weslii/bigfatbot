const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

// User registration
router.get('/register', authController.renderRegister);
router.post('/register', authController.handleRegister);

// User login
router.get('/login', authController.renderLogin);
router.post('/login', authController.handleLogin);

// User logout
router.post('/logout', authController.handleLogout);

// Business setup
router.get('/setup-business', authController.renderSetupBusiness);
router.post('/setup-business', authController.handleSetupBusiness);

// Password reset routes
router.post('/forgot-password', authController.forgotPassword);
router.post('/forgot-password-admin', authController.forgotPasswordAdmin);
router.get('/reset-password/:token', authController.showResetPassword);
router.post('/reset-password', authController.resetPassword);

module.exports = router; 