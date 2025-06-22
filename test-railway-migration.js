// Test script to verify Railway migration setup
const runMigrations = require('./scripts/railway-migrate');

console.log('🧪 Testing Railway migration setup...');
console.log('Environment variables:');
console.log('- DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
console.log('- DB_HOST:', process.env.DB_HOST ? 'Set' : 'Not set');
console.log('- NODE_ENV:', process.env.NODE_ENV || 'development');

runMigrations()
  .then(() => {
    console.log('✅ Migration test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration test failed:', error.message);
    process.exit(1);
  }); 