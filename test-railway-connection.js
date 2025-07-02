require('dotenv').config();
const knex = require('knex');
const redis = require('redis');
const url = require('url');

// Helper to determine if SSL/TLS should be used
function shouldUseSSL() {
  return process.env.NODE_ENV === 'production';
}

// Test Railway Database Connection
async function testDatabaseConnection() {
  console.log('🔍 Testing Railway Database Connection...');
  
  try {
    // Parse DATABASE_URL
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL not found in environment variables');
    }
    
    console.log('✅ DATABASE_URL found');
    
    // Create connection using the same config as your app
    const knexConfig = require('./knexfile');
    // Use production config if NODE_ENV=production, else development
    const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
    // Patch SSL config for local if needed
    if (!shouldUseSSL() && knexConfig[env].connection && knexConfig[env].connection.ssl) {
      knexConfig[env].connection.ssl = false;
    }
    const db = knex(knexConfig[env]);
    
    // Test connection
    const result = await db.raw('SELECT NOW() as current_time, version() as postgres_version');
    console.log('✅ Database connection successful!');
    console.log('📅 Current time:', result.rows[0].current_time);
    console.log('🐘 PostgreSQL version:', result.rows[0].postgres_version.split(' ')[0]);
    
    // Test if tables exist
    const tables = await db.raw(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('📋 Available tables:');
    tables.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    await db.destroy();
    return true;
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

// Test Railway Redis Connection
async function testRedisConnection() {
  console.log('\n🔍 Testing Railway Redis Connection...');
  
  try {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL not found in environment variables');
    }
    
    console.log('✅ REDIS_URL found');
    
    // Parse the URL to check for TLS
    const parsed = url.parse(redisUrl);
    const useTLS = parsed.protocol === 'rediss:' || shouldUseSSL();
    const client = redis.createClient({
      url: redisUrl,
      ...(useTLS ? { tls: {} } : {})
    });
    
    await client.connect();
    
    // Test connection
    await client.ping();
    console.log('✅ Redis connection successful!');
    
    // Test basic operations
    await client.set('test_key', 'test_value');
    const value = await client.get('test_key');
    await client.del('test_key');
    
    console.log('✅ Redis read/write operations successful!');
    
    // Get Redis info
    const info = await client.info('server');
    const version = info.split('\n').find(line => line.startsWith('redis_version'));
    console.log('📊 Redis version:', version ? version.split(':')[1] : 'Unknown');
    
    await client.disconnect();
    return true;
    
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    return false;
  }
}

// Main test function
async function runTests() {
  console.log('🚀 Testing Railway Connections...\n');
  
  const dbSuccess = await testDatabaseConnection();
  const redisSuccess = await testRedisConnection();
  
  console.log('\n📊 Test Results:');
  console.log(`Database: ${dbSuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Redis: ${redisSuccess ? '✅ PASS' : '❌ FAIL'}`);
  
  if (dbSuccess && redisSuccess) {
    console.log('\n🎉 All connections successful! Your Railway setup is working correctly.');
  } else {
    console.log('\n⚠️ Some connections failed. Please check your environment variables.');
  }
}

// Run the tests
runTests().catch(console.error); 