const { Client } = require('pg');
const knexfile = require('../knexfile');

const config = knexfile[process.env.NODE_ENV || 'production'].connection;
const client = new Client(config);

const waitForDatabase = async () => {
  let retries = 30;
  const delay = 2000; // 2 seconds

  while (retries > 0) {
    try {
      console.log('Attempting to connect to database...');
      await client.connect();
      console.log('Successfully connected to database!');
      await client.end();
      return true;
    } catch (error) {
      console.log(`Database connection failed. Retries left: ${retries}`);
      retries--;
      if (retries === 0) {
        console.error('Could not connect to database after multiple attempts');
        process.exit(1);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

waitForDatabase(); 