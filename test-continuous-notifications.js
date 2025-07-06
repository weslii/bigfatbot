const NotificationService = require('./src/services/NotificationService');

async function testContinuousNotifications() {
  console.log('🧪 Testing Continuous Error Notifications...\n');

  // Test 1: Start continuous connection error notifications
  console.log('1. Starting continuous connection error notifications...');
  const connectionError = new Error('WhatsApp Web disconnected unexpectedly');
  NotificationService.startContinuousErrorNotification('connection', connectionError, {
    'Disconnect Reason': 'Network timeout',
    'Last Connected': new Date().toISOString()
  });

  // Wait 30 seconds to see multiple notifications
  console.log('   Waiting 30 seconds to see multiple notifications...');
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Test 2: Start continuous service error notifications
  console.log('\n2. Starting continuous service error notifications...');
  const serviceError = new Error('Database connection failed');
  NotificationService.startContinuousErrorNotification('service', serviceError, {
    'Component': 'Database',
    'Action': 'Connection Attempt'
  });

  // Wait 25 seconds
  console.log('   Waiting 25 seconds to see multiple notifications...');
  await new Promise(resolve => setTimeout(resolve, 25000));

  // Test 3: Simulate connection restoration (should stop connection error notifications)
  console.log('\n3. Simulating connection restoration...');
  await NotificationService.notifyConnectionRestored({
    'Reconnection Time': '2.5 seconds',
    'Previous Status': 'Disconnected'
  });

  // Wait 15 seconds to confirm connection notifications stopped
  console.log('   Waiting 15 seconds to confirm connection notifications stopped...');
  await new Promise(resolve => setTimeout(resolve, 15000));

  // Test 4: Stop all continuous notifications
  console.log('\n4. Stopping all continuous notifications...');
  NotificationService.stopAllContinuousErrorNotifications();

  // Show active timers
  console.log('\n5. Active error timers:');
  console.log(NotificationService.getActiveErrorTimers());

  console.log('\n✅ Continuous notification tests completed!');
  console.log('Check your Telegram and email for the continuous error messages.');
  console.log('You should have seen:');
  console.log('- Connection error notifications every 20 seconds for 30 seconds');
  console.log('- Service error notifications every 20 seconds for 25 seconds');
  console.log('- Connection restored notification that stopped connection errors');
  console.log('- All notifications stopped at the end');
}

// Run the test
testContinuousNotifications().catch(console.error); 