const RegistrationService = require('../services/RegistrationService');
const logger = require('../utils/logger');
const db = require('../config/database');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

module.exports = {
  // User registration
  renderRegister: (req, res) => {
    res.render('register');
  },

  handleRegister: async (req, res) => {
    try {
      const { name, email, phoneNumber, password } = req.body;
      const user = await RegistrationService.registerUser(name, email, phoneNumber, password);
      res.redirect(`/setup-business?userId=${user.id}`);
    } catch (error) {
      logger.error('Registration error:', error);
      res.render('register', { error: 'Registration failed. Please try again.' });
    }
  },

  // User login
  renderLogin: (req, res) => {
    if (req.session && req.session.userId) {
      return res.redirect(`/dashboard?userId=${req.session.userId}`);
    }
    res.render('login');
  },

  handleLogin: async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.render('login', { error: 'Email and password are required' });
    }
    try {
      // Find user by email
      const user = await db.query('users').where('email', email).first();
      if (!user) {
        return res.render('login', { error: 'Invalid email or password' });
      }
      
      // Check password (assume password is stored as hash, if not, compare plain text)
      const bcrypt = require('bcryptjs');
      const isValid = user.password_hash
        ? await bcrypt.compare(password, user.password_hash)
        : password === user.password;
      if (!isValid) {
        return res.render('login', { error: 'Invalid email or password' });
      }
      if (!req.session) {
        logger.error('Session is undefined during login');
        return res.render('login', { error: 'Session error. Please try again or contact support.' });
      }
      
      // Ensure userId is a string
      const userIdString = String(user.id);
      req.session.userId = userIdString;
      
      req.session.save((err) => {
        if (err) {
          logger.error('Error saving session:', err);
          return res.render('login', { error: 'Login failed. Please try again.' });
        }
        
        res.redirect(`/dashboard?userId=${userIdString}`);
      });
    } catch (error) {
      logger.error('User login error:', error);
      res.render('login', { error: 'Login failed. Please try again.' });
    }
  },

  // User logout
  handleLogout: (req, res) => {
    if (req.session) {
      req.session.destroy(() => {
        res.redirect('/login');
      });
    } else {
      res.redirect('/login');
    }
  },

  // Business setup
  renderSetupBusiness: (req, res) => {
    const { userId } = req.query;
    res.render('setup-business', { userId });
  },

  handleSetupBusiness: async (req, res) => {
    try {
      const { userId, businessName } = req.body;
      const result = await RegistrationService.createBusiness(userId, businessName);
      
      // Check if we have a short code or need to use the business ID
      const setupCommand = result.setupIdentifier.includes('-') 
        ? `/setup ${result.setupIdentifier}` 
        : `/setup ${result.businessId}`;
      
      res.render('group-setup', { 
        userId,
        business: {
          business_id: result.businessId,
          setup_identifier: result.setupIdentifier
        },
        businessName,
        businessId: result.businessId,
        setupCommand
      });
    } catch (error) {
      logger.error('Business setup error:', error);
      res.render('setup-business', { 
        error: 'Setup failed. Please try again.',
        userId: req.body.userId
      });
    }
  },

  // Password reset functionality
  forgotPassword: async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required' });
      }

      // Find user by email
      const user = await db.query('users').where('email', email).first();
      
      if (!user) {
        // Don't reveal if email exists or not for security
        return res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store reset token in database
      await db.query('users')
        .where('id', user.id)
        .update({
          reset_token: resetToken,
          reset_token_expiry: resetTokenExpiry
        });

      // Create reset URL
      const resetUrl = `${req.protocol}://${req.get('host')}/auth/reset-password/${resetToken}`;

      // Send email (now using NotificationService)
      const NotificationService = require('../services/NotificationService');
      const subject = 'Novi Password Reset Request';
      const html = `<p>Hello,</p><p>You requested a password reset for your Novi account. Click the link below to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, please ignore this email.</p>`;
      await NotificationService.sendCustomEmail(email, subject, html);

      res.json({ success: true, message: 'Password reset link sent to your email.' });
    } catch (error) {
      logger.error('Forgot password error:', error);
      res.status(500).json({ success: false, message: 'Failed to process request' });
    }
  },

  forgotPasswordAdmin: async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required' });
      }

      // Find admin by email
      const admin = await db.query('admins').where('email', email).first();
      
      if (!admin) {
        // Don't reveal if email exists or not for security
        return res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store reset token in database
      await db.query('admins')
        .where('id', admin.id)
        .update({
          reset_token: resetToken,
          reset_token_expiry: resetTokenExpiry
        });

      // Create reset URL
      const resetUrl = `${req.protocol}://${req.get('host')}/auth/reset-password/${resetToken}?type=admin`;

      // Send email (you'll need to implement email sending)
      // For now, we'll just log the reset URL
      logger.info(`Admin password reset link for ${email}: ${resetUrl}`);

      res.json({ success: true, message: 'Password reset link sent to your email.' });
    } catch (error) {
      logger.error('Admin forgot password error:', error);
      res.status(500).json({ success: false, message: 'Failed to process request' });
    }
  },

  showResetPassword: async (req, res) => {
    try {
      const { token } = req.params;
      const { type } = req.query;

      if (!token) {
        return res.render('reset-password', { error: 'Invalid reset link' });
      }

      // Find user/admin by reset token
      const table = type === 'admin' ? 'admins' : 'users';
      const user = await db.query(table)
        .where('reset_token', token)
        .where('reset_token_expiry', '>', new Date())
        .first();

      if (!user) {
        return res.render('reset-password', { error: 'Reset link is invalid or has expired' });
      }

      res.render('reset-password', { token, type });
    } catch (error) {
      logger.error('Show reset password error:', error);
      res.render('reset-password', { error: 'An error occurred. Please try again.' });
    }
  },

  resetPassword: async (req, res) => {
    try {
      const { token, password } = req.body;
      const { type } = req.query;

      if (!token || !password) {
        return res.status(400).json({ success: false, message: 'Token and password are required' });
      }

      // Validate password strength
      if (password.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
      }

      // Find user/admin by reset token
      const table = type === 'admin' ? 'admins' : 'users';
      const user = await db.query(table)
        .where('reset_token', token)
        .where('reset_token_expiry', '>', new Date())
        .first();

      if (!user) {
        return res.status(400).json({ success: false, message: 'Reset link is invalid or has expired' });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Update password and clear reset token
      await db.query(table)
        .where('id', user.id)
        .update({
          password_hash: hashedPassword,
          reset_token: null,
          reset_token_expiry: null
        });

      res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
      logger.error('Reset password error:', error);
      res.status(500).json({ success: false, message: 'Failed to reset password' });
    }
  }
}; 