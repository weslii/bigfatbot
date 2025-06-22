const { spawn } = require('child_process');
const runMigrations = require('./railway-migrate');

const startBot = async () => {
  try {
    console.log('🚀 Starting Railway WhatsApp Bot...');
    
    // Wait for database and run migrations
    console.log('⏳ Waiting for database...');
    await new Promise((resolve, reject) => {
      const waitForDb = spawn('npm', ['run', 'wait-for-db'], { 
        stdio: 'inherit',
        shell: true 
      });
      
      waitForDb.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`wait-for-db failed with code ${code}`));
        }
      });
    });
    
    // Run migrations
    console.log('🔄 Running migrations...');
    await runMigrations();
    
    // Start the WhatsApp bot
    console.log('🤖 Starting WhatsApp bot...');
    const bot = spawn('npm', ['start'], { 
      stdio: 'inherit',
      shell: true 
    });
    
    bot.on('close', (code) => {
      console.log(`WhatsApp bot exited with code ${code}`);
      process.exit(code);
    });
    
    // Handle process signals
    process.on('SIGINT', () => {
      console.log('Received SIGINT, shutting down...');
      bot.kill('SIGINT');
    });
    
    process.on('SIGTERM', () => {
      console.log('Received SIGTERM, shutting down...');
      bot.kill('SIGTERM');
    });
    
  } catch (error) {
    console.error('❌ Failed to start WhatsApp bot:', error);
    process.exit(1);
  }
};

startBot(); 