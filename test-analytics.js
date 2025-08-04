const AnalyticsService = require('./src/services/AnalyticsService');
const database = require('./src/config/database');

async function testAnalytics() {
  try {
    console.log('🧪 Testing Analytics Functionality...\n');
    
    // Get a real user from the database
    const users = await database.query('users').select('id').limit(1);
    
    if (users.length > 0) {
      const realUserId = users[0].id;
      console.log(`Testing with real user ID: ${realUserId}`);
      
      // Test different time ranges
      const timeRanges = [7, 30, 90];
      
      for (const timeRange of timeRanges) {
        console.log(`\n📊 Testing ${timeRange}-day analytics...`);
        
        const analyticsData = await AnalyticsService.getUserAnalytics(realUserId, timeRange);
        
        console.log('Analytics Data Summary:');
        console.log(`- Total Revenue: ₦${analyticsData.totalRevenue.toLocaleString()}`);
        console.log(`- Total Orders: ${analyticsData.totalOrders}`);
        console.log(`- Average Order Value: ₦${analyticsData.averageOrderValue.toLocaleString()}`);
        console.log(`- Active Customers: ${analyticsData.activeCustomers}`);
        console.log(`- Revenue Change: ${analyticsData.revenueChange.toFixed(1)}%`);
        console.log(`- Order Change: ${analyticsData.orderChange.toFixed(1)}%`);
        console.log(`- Revenue Trend Data Points: ${analyticsData.revenueTrend.data.length}`);
        console.log(`- Order Trend Data Points: ${analyticsData.orderTrend.data.length}`);
        console.log(`- Business Revenue Chart: ${analyticsData.businessRevenue.labels.length} businesses`);
        console.log(`- Order Status Chart: ${analyticsData.orderStatus.labels.length} statuses`);
        console.log(`- Completion Rate: ${analyticsData.completionRate.toFixed(1)}%`);
        console.log(`- Best Performing Day: ${analyticsData.bestPerformingDay}`);
        console.log(`- Peak Order Day: ${analyticsData.peakOrderDay}`);
      }
      
      console.log('\n✅ Analytics functionality test completed successfully!');
      
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

testAnalytics(); 