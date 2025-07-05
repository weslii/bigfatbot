const NotificationService = require('./src/services/NotificationService');

async function testNotificationService() {
  console.log('🧪 Testing NotificationService...\n');

  // Test 1: System Error
  console.log('1. Testing System Error...');
  const systemError = new Error('Database connection failed');
  systemError.stack = 'Error: Database connection failed\n    at Database.connect (/app/db.js:15:10)\n    at Server.start (/app/server.js:25:5)';
  
  await NotificationService.notifySystemError(systemError, {
    'Component': 'Database',
    'Action': 'Connection Attempt'
  });

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 2: Group Error
  console.log('\n2. Testing Group Error...');
  const groupError = new Error('Failed to parse order message');
  
  await NotificationService.notifyGroupError(
    groupError,
    '123456789@group.whatsapp.com',
    'Sales Group Alpha',
    'My Business'
  );

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 3: Business Error
  console.log('\n3. Testing Business Error...');
  const businessError = new Error('Failed to create business');
  
  await NotificationService.notifyBusinessError(
    businessError,
    'business-123',
    'My Business'
  );

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 4: Connection Error
  console.log('\n4. Testing Connection Error...');
  const connectionError = new Error('WhatsApp Web disconnected unexpectedly');
  
  await NotificationService.notifyConnectionError(connectionError, {
    'Last Connected': '2025-01-04T15:30:00Z',
    'Reconnection Attempts': '3'
  });

  console.log('\n✅ All notification tests completed!');
  console.log('Check your Telegram and email for the test messages.');
}

testNotificationService().catch(console.error); 