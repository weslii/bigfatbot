const axios = require('axios');

const BOT_TOKEN = '8052725946:AAF67jb7lsOK9tle4wPL8CKgLhbvDE9hQQQ';
const CHAT_ID = '1073212927';

async function sendTelegramMessage(text) {
  try {
    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: text
    });
    
    if (response.data.ok) {
      console.log('✅ Telegram message sent successfully!');
      console.log('Message ID:', response.data.result.message_id);
    } else {
      console.log('❌ Failed to send message:', response.data);
    }
  } catch (error) {
    console.error('❌ Error sending Telegram message:', error.response?.data || error.message);
  }
}

// Test the message
sendTelegramMessage('🤖 Hello! This is a test message from your WhatsApp bot notification system.'); 