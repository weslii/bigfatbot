const NotificationService = require('./src/services/NotificationService');
const WhatsAppService = require('./src/services/WhatsAppService');
const RegistrationService = require('./src/services/RegistrationService');
const AdminService = require('./src/services/AdminService');

async function testAllIntegrations() {
  console.log('🧪 Testing All Notification Integrations...\n');

  // Test 1: WhatsApp Service Notifications
  console.log('1. Testing WhatsApp Service Notifications...');
  
  // Simulate connection restored
  await NotificationService.notifyConnectionRestored({
    'Reconnection Time': '3.2 seconds',
    'Previous Status': 'Disconnected'
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Simulate connection error
  await NotificationService.notifyConnectionError(
    new Error('WhatsApp Web disconnected unexpectedly'),
    {
      'Disconnect Reason': 'Network timeout',
      'Last Connected': new Date().toISOString()
    }
  );

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 2: Registration Service Notifications
  console.log('\n2. Testing Registration Service Notifications...');
  
  const sampleUser = {
    id: 'user-test-123',
    full_name: 'Test User',
    email: 'test@example.com',
    phone: '+1234567890'
  };

  // Simulate user registration
  await NotificationService.notifyUserRegistration(sampleUser, {
    'Registration Method': 'Web Dashboard',
    'IP Address': '192.168.1.100'
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Simulate business registration
  const sampleBusiness = {
    business_name: 'Test Business',
    business_id: 'business-test-456',
    group_id: '123456789@group.whatsapp.com',
    group_type: 'sales'
  };

  await NotificationService.notifyBusinessRegistration(sampleBusiness, sampleUser, {
    'Registration Method': 'WhatsApp Setup',
    'Setup Duration': '2.5 minutes'
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 3: Admin Service Notifications
  console.log('\n3. Testing Admin Service Notifications...');
  
  // Simulate user activation
  await NotificationService.notifyUserActivation(sampleUser, 'Admin', {
    'Activation Method': 'Admin Dashboard',
    'Previous Status': 'Pending'
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Simulate user deactivation
  await NotificationService.notifyUserDeactivation(
    sampleUser,
    'Admin',
    'Account suspended due to policy violation',
    {
      'Deactivation Method': 'Admin Dashboard',
      'Suspension Duration': '7 days'
    }
  );

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Simulate business deletion
  await NotificationService.notifyBusinessDeletion(
    sampleBusiness,
    sampleUser,
    'Admin',
    'Business closed by admin',
    {
      'Deletion Method': 'Admin Dashboard',
      'Orders Affected': '15'
    }
  );

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Simulate user deletion
  await NotificationService.notifyUserDeletion(
    sampleUser,
    'Admin',
    'Account terminated due to repeated violations',
    {
      'Deletion Method': 'Admin Dashboard',
      'Businesses Affected': '2',
      'Orders Affected': '45'
    }
  );

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 4: System Error Notifications
  console.log('\n4. Testing System Error Notifications...');
  
  // Simulate system error
  const systemError = new Error('Database connection timeout');
  systemError.stack = 'Error: Database connection timeout\n    at Database.connect (/app/db.js:25:10)\n    at Server.start (/app/server.js:30:5)';
  
  await NotificationService.notifySystemError(systemError, {
    'Component': 'Database',
    'Action': 'Connection Attempt',
    'Retry Count': '3'
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Simulate group error
  const groupError = new Error('Failed to parse order message');
  
  await NotificationService.notifyGroupError(
    groupError,
    '123456789@group.whatsapp.com',
    'Sales Group Alpha',
    'Test Business'
  );

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 5: Success Recovery Notifications
  console.log('\n5. Testing Success Recovery Notifications...');
  
  // Simulate system recovery
  await NotificationService.notifySystemRecovery('Database', {
    'Recovery Time': '2.1 seconds',
    'Previous Error': 'Connection timeout'
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Simulate order processing resumed
  await NotificationService.notifyOrderProcessingResumed(
    'Sales Group Alpha',
    'Test Business'
  );

  console.log('\n✅ All integration tests completed!');
  console.log('Check your Telegram and email for all the notification messages.');
  console.log('\n📊 Summary of notifications sent:');
  console.log('• 2 Connection notifications (restored + error)');
  console.log('• 2 Registration notifications (user + business)');
  console.log('• 4 Admin notifications (activation, deactivation, business deletion, user deletion)');
  console.log('• 2 Error notifications (system + group)');
  console.log('• 2 Recovery notifications (system + order processing)');
  console.log('• Total: 12 notifications');
}

testAllIntegrations().catch(console.error); 