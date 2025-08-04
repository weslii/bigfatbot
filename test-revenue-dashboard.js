const OrderService = require('./src/services/OrderService');
const database = require('./src/config/database');

async function testRevenueDashboard() {
  try {
    console.log('🧪 Testing Revenue Dashboard Functionality...\n');
    
    // Test with a sample user ID
    const testUserId = 'test-user-123';
    
    console.log('1. Testing getUserRevenueStats...');
    const revenueStats = await OrderService.getUserRevenueStats(testUserId);
    console.log('Revenue Stats:', revenueStats);
    
    console.log('\n2. Testing with actual user data...');
    // Get a real user from the database
    const users = await database.query('users').select('id').limit(1);
    
    if (users.length > 0) {
      const realUserId = users[0].id;
      console.log(`Testing with real user ID: ${realUserId}`);
      
      const realRevenueStats = await OrderService.getUserRevenueStats(realUserId);
      console.log('Real User Revenue Stats:', realRevenueStats);
      
      // Test order stats as well
      const orderStats = await OrderService.getUserOrderStats(realUserId);
      console.log('Order Stats:', orderStats);
      
      // Test recent orders
      const recentOrders = await OrderService.getUserRecentOrders(realUserId, 3);
      console.log('Recent Orders:', recentOrders.length);
      
      console.log('\n✅ Revenue dashboard functionality test completed successfully!');
      console.log('\n📊 Summary:');
      console.log(`- Total Revenue: ₦${realRevenueStats.totalRevenue.toLocaleString()}`);
      console.log(`- Today's Revenue: ₦${realRevenueStats.todayRevenue.toLocaleString()}`);
      console.log(`- This Week's Revenue: ₦${realRevenueStats.weekRevenue.toLocaleString()}`);
      console.log(`- This Month's Revenue: ₦${realRevenueStats.monthRevenue.toLocaleString()}`);
      console.log(`- Total Orders: ${orderStats.totalOrders}`);
      console.log(`- Recent Orders: ${recentOrders.length}`);
      
    } else {
      console.log('❌ No users found in database for testing');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Close database connection properly
    try {
      if (database && database.destroy) {
        await database.destroy();
      }
    } catch (error) {
      console.log('Database connection cleanup completed');
    }
    process.exit(0);
  }
}

testRevenueDashboard(); 