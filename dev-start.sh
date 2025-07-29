#!/bin/bash

# Novi Bot Local Development Script
# This script automates ngrok setup and app startup

echo "🤖 Novi Bot Local Development Setup"
echo "=================================="

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok not found. Please install it first:"
    echo "   npm install -g ngrok"
    echo "   or download from https://ngrok.com/download"
    exit 1
fi

# Check if jq is installed (for parsing JSON)
if ! command -v jq &> /dev/null; then
    echo "⚠️  jq not found. Installing..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install jq
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo apt-get install jq
    else
        echo "❌ Please install jq manually: https://stedolan.github.io/jq/download/"
        exit 1
    fi
fi

# Kill any existing ngrok processes
echo "🧹 Cleaning up existing ngrok processes..."
pkill -f ngrok 2>/dev/null || true

# Start ngrok in background
echo "🚀 Starting ngrok tunnel..."
ngrok http 3000 > ngrok.log 2>&1 &
NGROK_PID=$!

# Wait for ngrok to start
echo "⏳ Waiting for ngrok to start..."
sleep 5

# Get ngrok URL
echo "🔍 Getting ngrok URL..."
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | jq -r '.tunnels[0].public_url' 2>/dev/null)

if [ "$NGROK_URL" == "null" ] || [ -z "$NGROK_URL" ]; then
    echo "❌ Failed to get ngrok URL. Check ngrok.log for details."
    kill $NGROK_PID 2>/dev/null || true
    exit 1
fi

echo "✅ Ngrok URL: $NGROK_URL"

# Update .env file
echo "📝 Updating .env file..."
if [ -f .env ]; then
    # Update existing .env file
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|TELEGRAM_WEBHOOK_URL=.*|TELEGRAM_WEBHOOK_URL=$NGROK_URL|" .env
    else
        # Linux
        sed -i "s|TELEGRAM_WEBHOOK_URL=.*|TELEGRAM_WEBHOOK_URL=$NGROK_URL|" .env
    fi
    echo "✅ Updated existing .env file"
else
    # Create new .env file from template
    if [ -f env-template.txt ]; then
        cp env-template.txt .env
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|TELEGRAM_WEBHOOK_URL=.*|TELEGRAM_WEBHOOK_URL=$NGROK_URL|" .env
        else
            sed -i "s|TELEGRAM_WEBHOOK_URL=.*|TELEGRAM_WEBHOOK_URL=$NGROK_URL|" .env
        fi
        echo "✅ Created new .env file from template"
    else
        echo "❌ No env-template.txt found. Please create .env manually with:"
        echo "   TELEGRAM_WEBHOOK_URL=$NGROK_URL"
        echo "   TELEGRAM_BOT_TOKEN=your_bot_token_here"
        echo "   ENABLE_TELEGRAM=true"
    fi
fi

# Check if required env vars are set
echo "🔍 Checking environment variables..."
if ! grep -q "TELEGRAM_BOT_TOKEN" .env; then
    echo "⚠️  TELEGRAM_BOT_TOKEN not set in .env"
    echo "   Please add your bot token to .env file"
fi

if ! grep -q "ENABLE_TELEGRAM=true" .env; then
    echo "⚠️  ENABLE_TELEGRAM not set to true"
    echo "   Adding ENABLE_TELEGRAM=true to .env"
    echo "ENABLE_TELEGRAM=true" >> .env
fi

# Show current setup
echo ""
echo "📋 Current Setup:"
echo "   Ngrok URL: $NGROK_URL"
echo "   Webhook Endpoint: $NGROK_URL/api/telegram-webhook"
echo "   Ngrok Dashboard: http://localhost:4040"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    kill $NGROK_PID 2>/dev/null || true
    pkill -f ngrok 2>/dev/null || true
    echo "✅ Cleanup complete"
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup EXIT INT TERM

# Start the application
echo "🚀 Starting Novi Bot application..."
echo "   Press Ctrl+C to stop"
echo ""

# Start the app
npm start

# If we get here, the app has stopped
echo ""
echo "👋 Novi Bot stopped. Cleaning up..." 