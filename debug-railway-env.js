// Debug script to check Railway environment variables
console.log('🔍 Railway Environment Debug');
console.log('============================');

const envVars = [
  'DATABASE_URL',
  'POSTGRES_HOST',
  'POSTGRES_PORT',
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'NODE_ENV',
  'RAILWAY_ENVIRONMENT',
  'RAILWAY_PROJECT_ID',
  'RAILWAY_SERVICE_ID'
];

envVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    // Mask sensitive values
    if (varName.includes('PASSWORD')) {
      console.log(`${varName}: [MASKED]`);
    } else if (varName === 'DATABASE_URL') {
      console.log(`${varName}: ${value.substring(0, 30)}...`);
    } else {
      console.log(`${varName}: ${value}`);
    }
  } else {
    console.log(`${varName}: [NOT SET]`);
  }
});

console.log('\n🔍 Process Info:');
console.log('- Platform:', process.platform);
console.log('- Node version:', process.version);
console.log('- Current working directory:', process.cwd());

// Test if we can parse DATABASE_URL
if (process.env.DATABASE_URL) {
  console.log('\n🔍 Testing DATABASE_URL parsing...');
  const url = process.env.DATABASE_URL;
  const matches = url.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (matches) {
    console.log('✅ DATABASE_URL parsed successfully:');
    console.log('- Host:', matches[3]);
    console.log('- Port:', matches[4]);
    console.log('- User:', matches[1]);
    console.log('- Database:', matches[5]);
  } else {
    console.log('❌ Failed to parse DATABASE_URL');
    console.log('🔍 URL format should be: postgresql://user:password@host:port/database');
  }
} 