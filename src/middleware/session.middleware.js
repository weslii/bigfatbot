const logger = require('../utils/logger');

module.exports = {
  // Add session debugging middleware with more details
  sessionDebug: (req, res, next) => {
    if (req.path.startsWith('/admin')) {
      // console.log('Session middleware - Path:', req.path);
      // console.log('Session middleware - Session ID:', req.sessionID);
      // console.log('Session middleware - Session data:', req.session);
      // console.log('Session middleware - Cookie:', req.session.cookie);
    }
    next();
  },

  // Add session error handling middleware
  sessionErrorHandler: (err, req, res, next) => {
    console.error('Session error:', err);
    if (err.code === 'ECONNREFUSED') {
      return res.status(500).render('error', { error: 'Session service unavailable' });
    }
    next(err);
  }
}; 