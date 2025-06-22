// debug-setup.js
const database = require('./src/config/database');

const businessId = 'ab49a66b-bf3a-4bbc-a046-3fb18e66bea3';

async function debugSetup() {
  try {
    console.log('🔍 Debugging Setup Command...\n');
    
    // Check if business exists
    console.log('1. Checking if business exists...');
    const business = await database.query('groups')
      .where('business_id', businessId)
      .first();
    
    if (business) {
      console.log('✅ Business found:');
      console.log('  - Business Name:', business.business_name);
      console.log('  - User ID:', business.user_id);
      console.log('  - Group Type:', business.group_type);
    } else {
      console.log('❌ Business not found in database');
      console.log('   This means the business ID is invalid or not created yet.');
    }
    
    // Check all businesses
    console.log('\n2. All businesses in database:');
    const allBusinesses = await database.query('groups')
      .select('business_id', 'business_name', 'group_type')
      .groupBy('business_id', 'business_name', 'group_type');
    
    if (allBusinesses.length > 0) {
      allBusinesses.forEach(b => {
        console.log(`  - ${b.business_id}: ${b.business_name} (${b.group_type})`);
      });
    } else {
      console.log('  No businesses found in database');
    }
    
    // Check groups for this business
    console.log('\n3. Groups for this business:');
    const groups = await database.query('groups')
      .where('business_id', businessId);
    
    if (groups.length > 0) {
      groups.forEach(g => {
        console.log(`  - ${g.group_name} (${g.group_type})`);
      });
    } else {
      console.log('  No groups found for this business');
    }
    
    console.log('\n📋 Summary:');
    if (!business) {
      console.log('❌ The business ID does not exist in the database.');
      console.log('💡 You need to create a business first through the web dashboard.');
      console.log('   Go to: http://localhost:3000 (or your deployed URL)');
      console.log('   Login and create a business, then use that business ID.');
    } else {
      console.log('✅ Business exists, setup command should work.');
      console.log('💡 Make sure you\'re sending the command from a WhatsApp group.');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

debugSetup(); 