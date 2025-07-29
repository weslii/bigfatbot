# 🚀 Novi Bot Local Development Setup

Quick scripts to automate ngrok setup and local development.

## 📋 Prerequisites

1. **Install ngrok:**
   ```bash
   npm install -g ngrok
   # or download from https://ngrok.com/download
   ```

2. **Get your Telegram bot token:**
   - Message @BotFather on Telegram
   - Create a new bot: `/newbot`
   - Copy the token

## 🎯 Quick Start

### For Windows (Recommended):
```bash
# Run the PowerShell script
.\dev-start.ps1
```

### For Windows (Alternative):
```bash
# Run the batch file
dev-start.bat
```

### For Mac/Linux:
```bash
# Run the bash script
./dev-start.sh
```

## 🔧 What the Script Does

1. ✅ **Checks if ngrok is installed**
2. ✅ **Kills any existing ngrok processes**
3. ✅ **Starts ngrok tunnel** to port 3000
4. ✅ **Gets the ngrok HTTPS URL**
5. ✅ **Updates your .env file** with the webhook URL
6. ✅ **Checks environment variables**
7. ✅ **Starts your Novi Bot application**
8. ✅ **Cleans up** when you stop the script

## 📝 Environment Variables

The script will automatically update your `.env` file with:

```bash
TELEGRAM_WEBHOOK_URL=https://abc123.ngrok.io
ENABLE_TELEGRAM=true
```

**You still need to add manually:**
```bash
TELEGRAM_BOT_TOKEN=your_actual_bot_token_here
TELEGRAM_BOT_USERNAME=your_bot_username
```

## 🎯 Usage

### First Time Setup:
1. **Add your bot token** to `.env` file
2. **Run the script** (see Quick Start above)
3. **Test your bot** by sending a message

### Daily Development:
1. **Run the script** - it handles everything automatically
2. **Develop and test** your bot
3. **Press Ctrl+C** to stop when done

## 🔍 Monitoring

### Ngrok Dashboard:
- **URL:** http://localhost:4040
- **Shows:** Incoming webhook requests
- **Useful for:** Debugging webhook issues

### App Logs:
- **Check:** Console output for bot status
- **Look for:** "Telegram webhook set successfully"
- **Test:** Send a message to your bot

## 🛠️ Troubleshooting

### Script won't start:
```bash
# Check if ngrok is installed
ngrok version

# Install if missing
npm install -g ngrok
```

### Webhook not working:
```bash
# Check ngrok status
curl http://localhost:4040/api/tunnels

# Check webhook manually
curl "https://api.telegram.org/botYOUR_TOKEN/getWebhookInfo"
```

### Bot not responding:
1. **Check .env file** - make sure TELEGRAM_BOT_TOKEN is set
2. **Check app logs** - look for error messages
3. **Test webhook endpoint** - should return 404 (which is normal)

## 📋 Manual Steps (if script fails)

```bash
# 1. Start ngrok
ngrok http 3000

# 2. Copy the HTTPS URL (e.g., https://abc123.ngrok.io)

# 3. Update .env file
echo "TELEGRAM_WEBHOOK_URL=https://abc123.ngrok.io" >> .env

# 4. Start your app
npm start
```

## 🎯 Pro Tips

### For Development:
- **Use the script** - it's faster than manual setup
- **Check ngrok dashboard** - great for debugging
- **Keep .env file** - script updates it automatically

### For Testing:
- **Send test messages** to your bot
- **Check app logs** for processing
- **Use ngrok dashboard** to see webhook traffic

### For Production:
- **Use Railway/Heroku** instead of ngrok
- **Set fixed webhook URL** in environment variables
- **Remove ngrok dependency** for production

## 🚀 Ready to Start?

Just run one of the scripts and start developing! 🎉 