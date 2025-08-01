require('dotenv').config();

// Parse the DATABASE_URL if it exists
const parseDbUrl = (url) => {
  if (!url) return null;
  // Support both postgres:// and postgresql://
  const matches = url.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!matches) return null;
  const config = {
    host: matches[3],
    port: matches[4],
    user: matches[1],
    password: matches[2],
    database: matches[5]
  };
  // Only add SSL if in production
  if (process.env.NODE_ENV === 'production') {
    config.ssl = { rejectUnauthorized: false };
  }
  return config;
};

// Get connection details from DATABASE_URL or individual env vars
const getConnection = () => {
  if (process.env.DATABASE_URL) {
    return parseDbUrl(process.env.DATABASE_URL);
  }
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
    connection: {
      ...getConnection(),
      ssl: false
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