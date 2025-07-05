const nodemailer = require('nodemailer');

// You'll need to configure these with your Gmail credentials
const EMAIL_CONFIG = {
  service: 'gmail',
  auth: {
    user: 'wesleygreat58@gmail.com', // Replace with your Gmail
    pass: 'xnrt qyna xwve wfja'     // Replace with your Gmail app password
  }
};

const TO_EMAIL = 'wesleygreat58@gmail.com'; // Replace with your email

async function sendEmail(subject, text) {
  try {
    // Create transporter
    let transporter = nodemailer.createTransport(EMAIL_CONFIG);
    
    // Send email
    let info = await transporter.sendMail({
      from: `"WhatsApp Bot Alert" <${EMAIL_CONFIG.auth.user}>`,
      to: TO_EMAIL,
      subject: subject,
      text: text
    });
    
    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
  }
}

// Test the email
sendEmail(
  '[Bot Alert] Test Notification', 
  '🤖 This is a test email from your WhatsApp bot notification system.\n\nIf you received this, email notifications are working!'
); 