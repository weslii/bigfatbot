const NotificationService = require('./src/services/NotificationService');

async function enableContinuousNotifications() {
  console.log('🔔 Re-enabling continuous notifications...\n');
  
  try {
    // Enable continuous notifications
    NotificationService.setContinuousNotificationsEnabled(true);
    
    console.log('✅ Continuous notifications have been re-enabled!');
    console.log('📝 To disable them again, you can:');
    console.log('   1. Call NotificationService.setContinuousNotificationsEnabled(false)');
    console.log('   2. Or set DISABLE_CONTINUOUS_NOTIFICATIONS=true in your environment');
    console.log('   3. Or run the disable-continuous-notifications.js script');
    console.log('\n📊 Current status:');
    console.log(`   Continuous notifications enabled: ${NotificationService.isContinuousNotificationsEnabled()}`);
    console.log(`   Active timers: ${Object.keys(NotificationService.getActiveErrorTimers()).length}`);
    
  } catch (error) {
    console.error('❌ Error enabling continuous notifications:', error);
  }
}

// Run the function
enableContinuousNotifications().catch(console.error);
