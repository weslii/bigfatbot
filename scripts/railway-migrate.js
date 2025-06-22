const knex = require('knex');
const knexfile = require('../knexfile');
const logger = require('../src/utils/logger');

const runMigrations = async () => {
  let db;
  
  try {
    console.log('🚀 Starting Railway migrations...');
    
    // Get the appropriate configuration
    const config = knexfile[process.env.NODE_ENV || 'production'];
    console.log('📊 Using environment:', process.env.NODE_ENV || 'production');
    console.log('🔗 Database host:', config.connection.host);
    
    // Initialize knex
    db = knex(config);
    
    // Test connection
    await db.raw('SELECT 1');
    console.log('✅ Database connection successful');
    
    // Run migrations
    console.log('🔄 Running migrations...');
    const [batchNo, log] = await db.migrate.latest();
    
    if (log.length === 0) {
      console.log('✅ All migrations are up to date');
    } else {
      console.log(`✅ Migrations completed. Batch ${batchNo} ran ${log.length} migrations:`);
      log.forEach(migration => {
        console.log(`   - ${migration}`);
      });
    }
    
    // Run seeds if in production and no data exists
    try {
      const adminCount = await db('admins').count('* as count').first();
      if (adminCount.count === '0') {
        console.log('🌱 Running seeds...');
        await db.seed.run();
        console.log('✅ Seeds completed');
      } else {
        console.log('✅ Seeds already exist, skipping');
      }
    } catch (seedError) {
      console.log('⚠️  Seed error (non-critical):', seedError.message);
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    if (db) {
      await db.destroy();
      console.log('🔌 Database connection closed');
    }
  }
};

// Run migrations if this script is called directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('🎉 Railway migrations completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Railway migrations failed:', error);
      process.exit(1);
    });
}

module.exports = runMigrations; 