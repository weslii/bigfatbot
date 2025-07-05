const NotificationService = require('./src/services/NotificationService');

async function testSuccessNotifications() {
  console.log('🧪 Testing Success Notifications...\n');

  // Test 1: Connection Restored
  console.log('1. Testing Connection Restored...');
  await NotificationService.notifyConnectionRestored({
    'Reconnection Time': '2.5 seconds',
    'Previous Status': 'Disconnected'
  });

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 2: System Recovery
  console.log('\n2. Testing System Recovery...');
  await NotificationService.notifySystemRecovery('Order Parser', {
    'Recovery Time': '1.8 seconds',
    'Previous Error': 'Memory overflow'
  });

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 3: Order Processing Resumed
  console.log('\n3. Testing Order Processing Resumed...');
  await NotificationService.notifyOrderProcessingResumed(
    'Sales Group Alpha',
    'My Business'
  );

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 4: Database Recovery
  console.log('\n4. Testing Database Recovery...');
  await NotificationService.notifyDatabaseRecovery({
    'Recovery Time': '3.2 seconds',
    'Connection Pool': 'Restored'
  });

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 5: Service Restart
  console.log('\n5. Testing Service Restart...');
  await NotificationService.notifyServiceRestart('WhatsApp Service', {
    'Restart Time': '5.1 seconds',
    'Reason': 'Memory optimization'
  });

  console.log('\n✅ All success notification tests completed!');
  console.log('Check your Telegram and email for the success messages.');
}

testSuccessNotifications().catch(console.error); 