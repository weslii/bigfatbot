const database = require('./src/config/database');
const BotServiceManager = require('./src/services/BotServiceManager');
const logger = require('./src/utils/logger');

async function sendMaintenanceNotification() {
  try {
    console.log('🔄 Starting maintenance notification broadcast...');
    
    // Initialize the bot service manager
    const botManager = BotServiceManager.getInstance();
    await botManager.initialize();
    
    // Get all active users
    const users = await database.query('users')
      .select('id', 'full_name', 'email', 'phone_number')
      .where('is_active', true);
    
    console.log(`📊 Found ${users.length} active users to notify`);
    
    // Get all active groups for these users
    const groups = await database.query('groups')
      .select('group_id', 'group_type', 'business_name', 'user_id')
      .where('is_active', true)
      .whereIn('user_id', users.map(u => u.id));
    
    console.log(`📊 Found ${groups.length} active groups to notify`);
    
    // Maintenance message
    const maintenanceMessage = `🔧 *System Maintenance Notice*

Dear valued Novi user,

We are performing essential system maintenance and upgrades to improve your experience.

*Maintenance Details:*
• **Status:** System temporarily unavailable
• **Duration:** Until 6:00 AM tomorrow morning
• **Purpose:** Performance improvements and system upgrades

*What this means:*
• Order processing will be paused
• WhatsApp bot responses will be limited
• Dashboard access may be intermittent

*We apologize for any inconvenience.*
Your business data is safe and will be fully accessible once maintenance is complete.

Thank you for your patience and understanding.

*The Novi Team*`;

    let successCount = 0;
    let errorCount = 0;
    
    // Send to all active groups
    for (const group of groups) {
      try {
        // Send to WhatsApp groups
        await botManager.sendMessage('whatsapp', group.group_id, maintenanceMessage);
        console.log(`✅ Sent to WhatsApp group: ${group.business_name} (${group.group_type})`);
        successCount++;
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Failed to send to group ${group.group_id}:`, error.message);
        errorCount++;
      }
    }
    
    // Also send email notifications to users
    const NotificationService = require('./src/services/NotificationService');
    const notificationService = new NotificationService();
    
    for (const user of users) {
      try {
        const emailSubject = 'Novi System Maintenance - Service Temporarily Unavailable';
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">🔧 System Maintenance Notice</h2>
            <p>Dear ${user.full_name},</p>
            <p>We are performing essential system maintenance and upgrades to improve your Novi experience.</p>
            
            <h3 style="color: #555;">Maintenance Details:</h3>
            <ul>
              <li><strong>Status:</strong> System temporarily unavailable</li>
              <li><strong>Duration:</strong> Until 6:00 AM tomorrow morning</li>
              <li><strong>Purpose:</strong> Performance improvements and system upgrades</li>
            </ul>
            
            <h3 style="color: #555;">What this means:</h3>
            <ul>
              <li>Order processing will be paused</li>
              <li>WhatsApp bot responses will be limited</li>
              <li>Dashboard access may be intermittent</li>
            </ul>
            
            <p><strong>We apologize for any inconvenience.</strong><br>
            Your business data is safe and will be fully accessible once maintenance is complete.</p>
            
            <p>Thank you for your patience and understanding.</p>
            
            <p style="margin-top: 30px; color: #666;">
              Best regards,<br>
              <strong>The Novi Team</strong>
            </p>
          </div>
        `;
        
        await notificationService.sendCustomEmail(user.email, emailSubject, emailHtml);
        console.log(`✅ Sent email to: ${user.email}`);
        
      } catch (error) {
        console.error(`❌ Failed to send email to ${user.email}:`, error.message);
      }
    }
    
    console.log('\n📊 Maintenance Notification Summary:');
    console.log(`✅ Successful notifications: ${successCount}`);
    console.log(`❌ Failed notifications: ${errorCount}`);
    console.log(`📧 Email notifications sent to ${users.length} users`);
    console.log('🎉 Maintenance notification broadcast completed!');
    
  } catch (error) {
    console.error('❌ Error sending maintenance notifications:', error);
    logger.error('Maintenance notification error:', error);
  } finally {
    // Close database connection
    await database.destroy();
    process.exit(0);
  }
}

// Run the script
sendMaintenanceNotification();



