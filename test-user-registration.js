const NotificationService = require('./src/services/NotificationService');

async function testUserRegistrationNotifications() {
  console.log('🧪 Testing User Registration Notifications...\n');

  // Sample user data
  const sampleUser = {
    id: 'user-123',
    full_name: 'John Doe',
    email: 'john.doe@example.com',
    phone: '+1234567890'
  };

  const sampleBusiness = {
    business_id: 'business-456',
    business_name: 'John\'s Bakery',
    group_id: '123456789@group.whatsapp.com',
    group_type: 'sales'
  };

  // Test 1: User Registration
  console.log('1. Testing User Registration...');
  await NotificationService.notifyUserRegistration(sampleUser, {
    'Registration Method': 'Web Dashboard',
    'IP Address': '192.168.1.100'
  });

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 2: User Activation
  console.log('\n2. Testing User Activation...');
  await NotificationService.notifyUserActivation(sampleUser, 'Admin', {
    'Activation Method': 'Admin Dashboard',
    'Previous Status': 'Pending'
  });

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 3: Business Registration
  console.log('\n3. Testing Business Registration...');
  await NotificationService.notifyBusinessRegistration(sampleBusiness, sampleUser, {
    'Registration Method': 'WhatsApp Setup',
    'Setup Duration': '2.5 minutes'
  });

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 4: User Deactivation
  console.log('\n4. Testing User Deactivation...');
  await NotificationService.notifyUserDeactivation(
    sampleUser, 
    'Admin', 
    'Account suspended due to policy violation',
    {
      'Deactivation Method': 'Admin Dashboard',
      'Suspension Duration': '7 days'
    }
  );

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 5: Business Deletion
  console.log('\n5. Testing Business Deletion...');
  await NotificationService.notifyBusinessDeletion(
    sampleBusiness,
    sampleUser,
    'Admin',
    'Business closed by owner',
    {
      'Deletion Method': 'Admin Dashboard',
      'Orders Affected': '15'
    }
  );

  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 6: User Deletion
  console.log('\n6. Testing User Deletion...');
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

  console.log('\n✅ All user registration notification tests completed!');
  console.log('Check your Telegram and email for the registration messages.');
}

testUserRegistrationNotifications().catch(console.error); 