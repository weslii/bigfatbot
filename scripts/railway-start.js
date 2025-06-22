const { spawn } = require('child_process');
const runMigrations = require('./railway-migrate');

const startApplication = async () => {
  try {
    console.log('🚀 Starting Railway application...');
    
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
    
    // Start the web server
    console.log('🌐 Starting web server...');
    const webServer = spawn('npm', ['run', 'start:web'], { 
      stdio: 'inherit',
      shell: true 
    });
    
    webServer.on('close', (code) => {
      console.log(`Web server exited with code ${code}`);
      process.exit(code);
    });
    
    // Handle process signals
    process.on('SIGINT', () => {
      console.log('Received SIGINT, shutting down...');
      webServer.kill('SIGINT');
    });
    
    process.on('SIGTERM', () => {
      console.log('Received SIGTERM, shutting down...');
      webServer.kill('SIGTERM');
    });
    
  } catch (error) {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  }
};

startApplication(); 