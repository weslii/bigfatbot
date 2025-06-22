// Simple bot startup script for Railway
const { spawn } = require('child_process');

console.log('🚀 Starting WhatsApp Bot (Simple Mode)...');

// Set environment variable for bot port
process.env.BOT_PORT = process.env.BOT_PORT || '3001';

// Start the bot directly
const bot = spawn('node', ['src/index.js'], { 
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    BOT_PORT: process.env.BOT_PORT
  }
});

bot.on('close', (code) => {
  console.log(`Bot process exited with code ${code}`);
  process.exit(code);
});

bot.on('error', (error) => {
  console.error('Bot process error:', error);
  process.exit(1);
});

// Handle process signals
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down bot...');
  bot.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down bot...');
  bot.kill('SIGTERM');
});

// Keep the process alive
process.on('exit', (code) => {
  console.log(`Process exiting with code ${code}`);
}); 