const RegistrationService = require('../services/RegistrationService');
const logger = require('../utils/logger');
const db = require('../config/database');

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
  }
}; 