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

  async sendEmail(subject, text) {
    if (!this.emailTransporter) {
      logger.error('Email transporter not initialized');
      return false;
    }

    try {
      const info = await this.emailTransporter.sendMail({
        from: `"WhatsApp Bot Alert" <${EMAIL_CONFIG.auth.user}>`,
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
}

module.exports = new NotificationService(); 