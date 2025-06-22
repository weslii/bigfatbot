const { Client } = require('pg');
const knexfile = require('../knexfile');

const getConnectionConfig = () => {
  console.log('🔍 Getting database connection config...');
  
  // Check for Railway's individual environment variables first (preferred)
  if (process.env.POSTGRES_HOST || process.env.POSTGRES_DB || process.env.PGHOST || process.env.PGDATABASE) {
    console.log('📡 Using Railway POSTGRES_* or PG* variables (preferred)');
    const connection = {
      host: process.env.POSTGRES_HOST || process.env.PGHOST || 'localhost',
      port: process.env.POSTGRES_PORT || process.env.PGPORT || 5432,
      database: process.env.POSTGRES_DB || process.env.PGDATABASE || 'railway',
      user: process.env.POSTGRES_USER || process.env.PGUSER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || '',
      ssl: { rejectUnauthorized: false }
    };
    
    console.log('🔍 Connection details from individual variables:', {
      host: connection.host,
      port: connection.port,
      database: connection.database,
      user: connection.user
    });
    
    return connection;
  }
  
  // Use knexfile configuration
  const config = knexfile[process.env.NODE_ENV || 'production'].connection;
  console.log('📡 Using knexfile configuration');
  return config;
};

const waitForDatabase = async () => {
  let retries = 30;
  const delay = 2000; // 2 seconds
  const config = getConnectionConfig();
  
  console.log('🔍 Database connection config:', {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user
  });

  while (retries > 0) {
    try {
      console.log(`🔌 Attempting to connect to database (${retries} retries left)...`);
      const client = new Client(config);
      await client.connect();
      console.log('✅ Successfully connected to database!');
      await client.end();
      return true;
    } catch (error) {
      console.log(`❌ Database connection failed: ${error.message}`);
      retries--;
      if (retries === 0) {
        console.error('💥 Could not connect to database after multiple attempts');
        console.error('🔍 Final error details:', {
          message: error.message,
          code: error.code,
          errno: error.errno,
          syscall: error.syscall,
          hostname: error.hostname
        });
        process.exit(1);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

waitForDatabase(); 