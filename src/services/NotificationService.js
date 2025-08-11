const nodemailer = require('nodemailer');
const axios = require('axios');
const logger = require('../utils/logger');

// Configuration - you can move these to environment variables later
const TELEGRAM_BOT_TOKEN = '8052725946:AAF67jb7lsOK9tle4wPL8CKgLhbvDE9hQQQ';
const TELEGRAM_CHAT_ID = '1073212927';

const EMAIL_CONFIG = {
  service: 'gmail',
  auth: {
    user: 'wesleygreat58@gmail.com',
    pass: 'xnrt qyna xwve wfja' // Your actual app password
  }
};

const TO_EMAIL = 'wesleygreat58@gmail.com';

class NotificationService {
  constructor() {
    this.emailTransporter = null;
    this.initializeEmailTransporter();
    
    // Timer management for continuous error notifications
    this.activeErrorTimers = new Map(); // Track active timers by error type
    this.errorNotificationInterval = 20000; // 20 seconds
    
    // Configuration for continuous notifications
    this.continuousNotificationsEnabled = process.env.DISABLE_CONTINUOUS_NOTIFICATIONS !== 'true';
  }

  initializeEmailTransporter() {
    try {
      this.emailTransporter = nodemailer.createTransport(EMAIL_CONFIG);
      logger.info('Email transporter initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize email transporter:', error);
    }
  }

  async sendTelegramMessage(text) {
    try {
      const response = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: 'Markdown'
      });
      
      if (response.data.ok) {
        logger.info('Telegram notification sent successfully');
        return true;
      } else {
        logger.error('Failed to send Telegram message:', response.data);
        return false;
      }
    } catch (error) {
      logger.error('Error sending Telegram message:', error.response?.data || error.message);
      return false;
    }
  }

  async sendCustomEmail(to, subject, html) {
    if (!this.emailTransporter) {
      logger.error('Email transporter not initialized');
      return false;
    }
    try {
      const info = await this.emailTransporter.sendMail({
        from: `"Novi Support" <${EMAIL_CONFIG.auth.user}>`,
        to,
        subject,
        html
      });
      logger.info(`Custom email sent to ${to} successfully`);
      return true;
    } catch (error) {
      logger.error('Error sending custom email:', error.message);
      return false;
    }
  }

  // Update sendEmail to use Novi Bot Alert as display name
  async sendEmail(subject, text) {
    if (!this.emailTransporter) {
      logger.error('Email transporter not initialized');
      return false;
    }

    try {
      const info = await this.emailTransporter.sendMail({
        from: `"Novi Bot Alert" <${EMAIL_CONFIG.auth.user}>`,
        to: TO_EMAIL,
        subject: subject,
        text: text
      });
      logger.info('Email notification sent successfully');
      return true;
    } catch (error) {
      logger.error('Error sending email:', error.message);
      return false;
    }
  }

  formatErrorSummary(error, context = {}) {
    const { group, business, type = 'System', additionalInfo = {} } = context;
    
    const timestamp = new Date().toISOString();
    const errorMessage = error.message || error.toString();
    const errorStack = error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : '';

    let summary = `🚨 *${type} Error*\n\n`;
    summary += `*Time:* ${timestamp}\n`;
    
    if (group) {
      summary += `*Group:* ${group}\n`;
    }
    
    if (business) {
      summary += `*Business:* ${business}\n`;
    }
    
    summary += `*Error:* ${errorMessage}\n`;
    
    if (errorStack) {
      summary += `\n*Stack Trace:*\n\`\`\`\n${errorStack}\n\`\`\``;
    }
    
    if (Object.keys(additionalInfo).length > 0) {
      summary += `\n*Additional Info:*\n`;
      for (const [key, value] of Object.entries(additionalInfo)) {
        summary += `• ${key}: ${value}\n`;
      }
    }

    return summary;
  }

  async notifyError(error, context = {}) {
    try {
      const summary = this.formatErrorSummary(error, context);
      const subject = `[Bot Alert] ${context.type || 'System'} Error`;
      
      // Send both notifications
      const telegramResult = await this.sendTelegramMessage(summary);
      const emailResult = await this.sendEmail(subject, summary);
      
      logger.info(`Error notifications sent - Telegram: ${telegramResult}, Email: ${emailResult}`);
      
      return {
        success: telegramResult || emailResult, // Success if at least one worked
        telegram: telegramResult,
        email: emailResult
      };
    } catch (notificationError) {
      logger.error('Error in notifyError:', notificationError);
      return { success: false, telegram: false, email: false };
    }
  }

  // Convenience methods for different error types
  async notifyGroupError(error, groupId, groupName, businessName = null) {
    return this.notifyError(error, {
      type: 'Group',
      group: `${groupName} (${groupId})`,
      business: businessName,
      additionalInfo: {
        'Error Type': 'Group Processing Error'
      }
    });
  }

  async notifyBusinessError(error, businessId, businessName) {
    return this.notifyError(error, {
      type: 'Business',
      business: `${businessName} (${businessId})`,
      additionalInfo: {
        'Error Type': 'Business Processing Error'
      }
    });
  }

  async notifySystemError(error, additionalInfo = {}) {
    return this.notifyError(error, {
      type: 'System',
      additionalInfo: {
        'Error Type': 'System Error',
        ...additionalInfo
      }
    });
  }

  async notifyConnectionError(error, additionalInfo = {}) {
    return this.notifyError(error, {
      type: 'Connection',
      additionalInfo: {
        'Error Type': 'WhatsApp Connection Error',
        ...additionalInfo
      }
    });
  }

  // Success notification methods
  async notifySuccess(message, context = {}) {
    try {
      const { type = 'System', additionalInfo = {} } = context;
      
      const timestamp = new Date().toISOString();
      let summary = `✅ *${type} Success*\n\n`;
      summary += `*Time:* ${timestamp}\n`;
      summary += `*Message:* ${message}\n`;
      
      if (Object.keys(additionalInfo).length > 0) {
        summary += `\n*Details:*\n`;
        for (const [key, value] of Object.entries(additionalInfo)) {
          summary += `• ${key}: ${value}\n`;
        }
      }

      const subject = `[Bot Success] ${context.type || 'System'} Resolved`;
      
      // Send both notifications
      const telegramResult = await this.sendTelegramMessage(summary);
      const emailResult = await this.sendEmail(subject, summary);
      
      logger.info(`Success notifications sent - Telegram: ${telegramResult}, Email: ${emailResult}`);
      
      return {
        success: telegramResult || emailResult,
        telegram: telegramResult,
        email: emailResult
      };
    } catch (notificationError) {
      logger.error('Error in notifySuccess:', notificationError);
      return { success: false, telegram: false, email: false };
    }
  }

  // Convenience methods for different success types
  async notifyConnectionRestored(additionalInfo = {}) {
    // Stop any active connection error timers when connection is restored
    this.stopContinuousErrorNotification('connection');
    
    return this.notifySuccess('WhatsApp connection has been restored successfully!', {
      type: 'Connection',
      additionalInfo: {
        'Status': 'Connected',
        'Event': 'Connection Restored',
        ...additionalInfo
      }
    });
  }

  async notifySystemRecovery(component, additionalInfo = {}) {
    return this.notifySuccess(`${component} has recovered and is functioning normally.`, {
      type: 'System',
      additionalInfo: {
        'Component': component,
        'Status': 'Recovered',
        ...additionalInfo
      }
    });
  }

  async notifyOrderProcessingResumed(groupName = null, businessName = null) {
    const context = {
      type: 'Order Processing',
      additionalInfo: {
        'Status': 'Resumed',
        'Event': 'Processing Restored'
      }
    };

    if (groupName) {
      context.additionalInfo['Group'] = groupName;
    }
    if (businessName) {
      context.additionalInfo['Business'] = businessName;
    }

    return this.notifySuccess('Order processing has resumed successfully!', context);
  }

  async notifyDatabaseRecovery(additionalInfo = {}) {
    return this.notifySuccess('Database connection has been restored successfully!', {
      type: 'Database',
      additionalInfo: {
        'Status': 'Connected',
        'Event': 'Database Recovery',
        ...additionalInfo
      }
    });
  }

  async notifyServiceRestart(serviceName, additionalInfo = {}) {
    return this.notifySuccess(`${serviceName} has been restarted successfully!`, {
      type: 'Service',
      additionalInfo: {
        'Service': serviceName,
        'Status': 'Running',
        'Event': 'Service Restart',
        ...additionalInfo
      }
    });
  }

  // User registration notifications
  async notifyUserRegistration(userData, additionalInfo = {}) {
    const { full_name, email, phone, id } = userData;
    
    return this.notifySuccess(`New user registered successfully!`, {
      type: 'User Registration',
      additionalInfo: {
        'User ID': id,
        'Full Name': full_name,
        'Email': email,
        'Phone': phone,
        'Registration Time': new Date().toISOString(),
        'Status': 'Active',
        ...additionalInfo
      }
    });
  }

  async notifyUserActivation(userData, activatedBy = 'System', additionalInfo = {}) {
    const { full_name, email, id } = userData;
    
    return this.notifySuccess(`User account activated successfully!`, {
      type: 'User Activation',
      additionalInfo: {
        'User ID': id,
        'Full Name': full_name,
        'Email': email,
        'Activated By': activatedBy,
        'Activation Time': new Date().toISOString(),
        'Status': 'Active',
        ...additionalInfo
      }
    });
  }

  async notifyUserDeactivation(userData, deactivatedBy = 'System', reason = null, additionalInfo = {}) {
    const { full_name, email, id } = userData;
    
    const context = {
      type: 'User Deactivation',
      additionalInfo: {
        'User ID': id,
        'Full Name': full_name,
        'Email': email,
        'Deactivated By': deactivatedBy,
        'Deactivation Time': new Date().toISOString(),
        'Status': 'Inactive',
        ...additionalInfo
      }
    };

    if (reason) {
      context.additionalInfo['Reason'] = reason;
    }

    return this.notifySuccess(`User account deactivated.`, context);
  }

  async notifyUserDeletion(userData, deletedBy = 'System', reason = null, additionalInfo = {}) {
    const { full_name, email, id } = userData;
    
    const context = {
      type: 'User Deletion',
      additionalInfo: {
        'User ID': id,
        'Full Name': full_name,
        'Email': email,
        'Deleted By': deletedBy,
        'Deletion Time': new Date().toISOString(),
        'Status': 'Deleted',
        ...additionalInfo
      }
    };

    if (reason) {
      context.additionalInfo['Reason'] = reason;
    }

    return this.notifySuccess(`User account deleted.`, context);
  }

  async notifyBusinessRegistration(businessData, userData, additionalInfo = {}) {
    const { business_name, business_id, group_id, group_type } = businessData;
    const { full_name, email } = userData;
    
    return this.notifySuccess(`New business registered successfully!`, {
      type: 'Business Registration',
      additionalInfo: {
        'Business ID': business_id,
        'Business Name': business_name,
        'Group ID': group_id,
        'Group Type': group_type,
        'Owner': full_name,
        'Owner Email': email,
        'Registration Time': new Date().toISOString(),
        'Status': 'Active',
        ...additionalInfo
      }
    });
  }

  async notifyBusinessDeletion(businessData, userData, deletedBy = 'System', reason = null, additionalInfo = {}) {
    const { business_name, business_id, group_id } = businessData;
    const { full_name, email } = userData;
    
    const context = {
      type: 'Business Deletion',
      additionalInfo: {
        'Business ID': business_id,
        'Business Name': business_name,
        'Group ID': group_id,
        'Owner': full_name,
        'Owner Email': email,
        'Deleted By': deletedBy,
        'Deletion Time': new Date().toISOString(),
        'Status': 'Deleted',
        ...additionalInfo
      }
    };

    if (reason) {
      context.additionalInfo['Reason'] = reason;
    }

    return this.notifySuccess(`Business deleted.`, context);
  }

  // Continuous error notification methods
  startContinuousErrorNotification(errorType, error, additionalInfo = {}) {
    // Check if continuous notifications are disabled
    if (!this.continuousNotificationsEnabled) {
      logger.info(`Continuous notifications are disabled. Skipping ${errorType} error notification.`);
      return;
    }
    
    // Stop any existing timer for this error type
    this.stopContinuousErrorNotification(errorType);
    
    // Create a timer that sends notifications every 20 seconds
    const timer = setInterval(async () => {
      try {
        logger.info(`Sending continuous ${errorType} error notification`);
        
        switch (errorType) {
          case 'connection':
            await this.notifyConnectionError(error, {
              ...additionalInfo,
              'Continuous Alert': 'Yes',
              'Alert Count': this.getErrorAlertCount(errorType)
            });
            break;
          case 'service':
            await this.notifySystemError(error, {
              ...additionalInfo,
              'Continuous Alert': 'Yes',
              'Alert Count': this.getErrorAlertCount(errorType)
            });
            break;
          default:
            await this.notifyError(error, {
              type: errorType.charAt(0).toUpperCase() + errorType.slice(1),
              additionalInfo: {
                ...additionalInfo,
                'Continuous Alert': 'Yes',
                'Alert Count': this.getErrorAlertCount(errorType)
              }
            });
        }
      } catch (notificationError) {
        logger.error(`Error sending continuous ${errorType} notification:`, notificationError);
      }
    }, this.errorNotificationInterval);
    
    // Store the timer and error info
    this.activeErrorTimers.set(errorType, {
      timer,
      error,
      additionalInfo,
      startTime: Date.now(),
      alertCount: 0
    });
    
    logger.info(`Started continuous ${errorType} error notifications every ${this.errorNotificationInterval/1000} seconds`);
  }

  stopContinuousErrorNotification(errorType) {
    const timerInfo = this.activeErrorTimers.get(errorType);
    if (timerInfo) {
      clearInterval(timerInfo.timer);
      this.activeErrorTimers.delete(errorType);
      logger.info(`Stopped continuous ${errorType} error notifications`);
    }
  }

  stopAllContinuousErrorNotifications() {
    for (const [errorType, timerInfo] of this.activeErrorTimers) {
      clearInterval(timerInfo.timer);
      logger.info(`Stopped continuous ${errorType} error notifications`);
    }
    this.activeErrorTimers.clear();
    logger.info('Stopped all continuous error notifications');
  }

  getErrorAlertCount(errorType) {
    const timerInfo = this.activeErrorTimers.get(errorType);
    if (timerInfo) {
      timerInfo.alertCount++;
      return timerInfo.alertCount;
    }
    return 1;
  }

  isContinuousNotificationActive(errorType) {
    return this.activeErrorTimers.has(errorType);
  }

  getActiveErrorTimers() {
    const activeTimers = {};
    for (const [errorType, timerInfo] of this.activeErrorTimers) {
      activeTimers[errorType] = {
        startTime: timerInfo.startTime,
        alertCount: timerInfo.alertCount,
        duration: Date.now() - timerInfo.startTime
      };
    }
    return activeTimers;
  }

  // Method to enable/disable continuous notifications
  setContinuousNotificationsEnabled(enabled) {
    this.continuousNotificationsEnabled = enabled;
    logger.info(`Continuous notifications ${enabled ? 'enabled' : 'disabled'}`);
    
    // If disabling, stop all active continuous notifications
    if (!enabled) {
      this.stopAllContinuousErrorNotifications();
    }
  }

  // Method to check if continuous notifications are enabled
  isContinuousNotificationsEnabled() {
    return this.continuousNotificationsEnabled;
  }
}

module.exports = new NotificationService(); 