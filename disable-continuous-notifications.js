const NotificationService = require('./src/services/NotificationService');

async function disableContinuousNotifications() {
  console.log('🔕 Disabling continuous notifications...\n');
  
  try {
    // Stop all currently active continuous notifications
    NotificationService.stopAllContinuousErrorNotifications();
    
    // Disable future continuous notifications
    NotificationService.setContinuousNotificationsEnabled(false);
    
    console.log('✅ Continuous notifications have been disabled!');
    console.log('📝 To re-enable them later, you can:');
    console.log('   1. Call NotificationService.setContinuousNotificationsEnabled(true)');
    console.log('   2. Or set DISABLE_CONTINUOUS_NOTIFICATIONS=false in your environment');
    console.log('\n📊 Current status:');
    console.log(`   Continuous notifications enabled: ${NotificationService.isContinuousNotificationsEnabled()}`);
    console.log(`   Active timers: ${Object.keys(NotificationService.getActiveErrorTimers()).length}`);
    
  } catch (error) {
    console.error('❌ Error disabling continuous notifications:', error);
  }
}

// Run the function
disableContinuousNotifications().catch(console.error);
