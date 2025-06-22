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
  
  // Check for Railway's individual environment variables first (preferred)
  if (process.env.POSTGRES_HOST || process.env.POSTGRES_DB || process.env.PGHOST) {
    console.log('📡 Using Railway POSTGRES_* or PG* variables (preferred)');
    return {
      host: process.env.POSTGRES_HOST || process.env.PGHOST || 'localhost',
      port: process.env.POSTGRES_PORT || process.env.PGPORT || 5432,
      database: process.env.POSTGRES_DB || process.env.PGDATABASE || 'railway',
      user: process.env.POSTGRES_USER || process.env.PGUSER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || '',
      ssl: { rejectUnauthorized: false }
    };
  }
  
  // Fallback to DATABASE_URL if no individual variables
  if (process.env.DATABASE_URL) {
    console.log('📡 Using DATABASE_URL (fallback)');
    return parseDbUrl(process.env.DATABASE_URL);
  }
  
  // Fallback to traditional DB_* variables
  console.log('📡 Using traditional DB_* variables (fallback)');
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