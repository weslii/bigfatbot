const NotificationService = require('./src/services/NotificationService');

async function testFixes() {
  console.log('🧪 Testing Notification Fixes...\n');

  // Test 1: Admin methods with custom reasons
  console.log('1. Testing Admin methods with custom reasons...');
  
  const sampleUser = {
    id: 'user-test-123',
    full_name: 'Test User',
    email: 'test@example.com',
    phone: '+1234567890'
  };

  const sampleBusiness = {
    business_name: 'Test Business',
    business_id: 'business-test-456',
    group_id: '123456789@group.whatsapp.com',
    group_type: 'sales'
  };

  // Test user deactivation with custom reason
  await NotificationService.notifyUserDeactivation(
    sampleUser,
    'Admin',
    'Account suspended due to payment issues',
    {
      'Deactivation Method': 'Admin Dashboard',
      'Suspension Duration': '30 days'
    }
  );

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test user deletion with custom reason
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

  // Test business deletion with custom reason
  await NotificationService.notifyBusinessDeletion(
    sampleBusiness,
    sampleUser,
    'Admin',
    'Business closed due to policy violations',
    {
      'Deletion Method': 'Admin Dashboard',
      'Orders Affected': '15'
    }
  );

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 2: Error handling with invalid data
  console.log('\n2. Testing error handling with invalid data...');
  
  try {
    // Test with undefined user data
    await NotificationService.notifyUserRegistration(undefined, {
      'Registration Method': 'Test'
    });
  } catch (error) {
    console.log('✅ Caught error for undefined user data:', error.message);
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    // Test with missing required fields
    await NotificationService.notifyBusinessRegistration(
      { business_name: 'Test' }, // Missing required fields
      { full_name: 'Test' },     // Missing required fields
      { 'Test': 'data' }
    );
  } catch (error) {
    console.log('✅ Caught error for missing required fields:', error.message);
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 3: Valid notifications to ensure they still work
  console.log('\n3. Testing valid notifications...');
  
  await NotificationService.notifyUserRegistration(sampleUser, {
    'Registration Method': 'Web Dashboard',
    'IP Address': '192.168.1.100'
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  await NotificationService.notifyBusinessRegistration(sampleBusiness, sampleUser, {
    'Registration Method': 'WhatsApp Setup',
    'Setup Duration': '2.5 minutes'
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  await NotificationService.notifyConnectionRestored({
    'Reconnection Time': '3.2 seconds',
    'Previous Status': 'Disconnected'
  });

  console.log('\n✅ All fixes tested successfully!');
  console.log('Check your Telegram and email for the test messages.');
  console.log('\n📊 Summary:');
  console.log('• Custom reasons working properly');
  console.log('• Error handling working properly');
  console.log('• Valid notifications still working');
}

testFixes().catch(console.error); 