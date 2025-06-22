require('dotenv').config();

// Parse the DATABASE_URL if it exists
const parseDbUrl = (url) => {
  if (!url) return null;
  console.log('🔍 Parsing DATABASE_URL:', url.substring(0, 30) + '...');
  
  // Handle both postgres:// and postgresql:// protocols
  const matches = url.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!matches) {
    console.log('❌ Failed to parse DATABASE_URL');
    console.log('🔍 URL format should be: postgresql://user:password@host:port/database');
    return null;
  }
  
  const parsed = {
    host: matches[3],
    port: matches[4],
    user: matches[1],
    password: matches[2],
    database: matches[5],
    ssl: { rejectUnauthorized: false }
  };
  
  console.log('✅ Parsed DATABASE_URL:', {
    host: parsed.host,
    port: parsed.port,
    user: parsed.user,
    database: parsed.database
  });
  
  return parsed;
};

// Get connection details from DATABASE_URL or individual env vars
const getConnection = () => {
  console.log('🔍 Getting database connection...');
  
  if (process.env.DATABASE_URL) {
    console.log('📡 Using DATABASE_URL');
    return parseDbUrl(process.env.DATABASE_URL);
  }
  
  // Check for Railway's individual environment variables
  if (process.env.POSTGRES_HOST) {
    console.log('📡 Using Railway POSTGRES_* variables');
    return {
      host: process.env.POSTGRES_HOST,
      port: process.env.POSTGRES_PORT || 5432,
      database: process.env.POSTGRES_DB || 'railway',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || '',
      ssl: { rejectUnauthorized: false }
    };
  }
  
  // Fallback to traditional DB_* variables
  console.log('📡 Using traditional DB_* variables');
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'whatsapp_bot',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  };
};

module.exports = {
  development: {
    client: 'postgresql',
    connection: getConnection(),
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 100,
    },
    migrations: {
      directory: './src/database/migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './src/database/seeds'
    }
  },

  production: {
    client: 'postgresql',
    connection: {
      ...getConnection(),
      ssl: { rejectUnauthorized: false }
    },
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 100,
    },
    migrations: {
      directory: './src/database/migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './src/database/seeds'
    }
  }
}; 