# Novi Bot Local Development Script (PowerShell)
# This script automates ngrok setup and app startup

Write-Host "🤖 Novi Bot Local Development Setup" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Green

# Check if ngrok is installed
if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
    Write-Host "❌ ngrok not found. Please install it first:" -ForegroundColor Red
    Write-Host "   npm install -g ngrok" -ForegroundColor Yellow
    Write-Host "   or download from https://ngrok.com/download" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Kill any existing ngrok processes
Write-Host "🧹 Cleaning up existing ngrok processes..." -ForegroundColor Yellow
Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force

# Start ngrok in background
Write-Host "🚀 Starting ngrok tunnel..." -ForegroundColor Green
Start-Process ngrok -ArgumentList "http 3000" -WindowStyle Hidden -RedirectStandardOutput "ngrok.log" -RedirectStandardError "ngrok.log"

# Wait for ngrok to start
Write-Host "⏳ Waiting for ngrok to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Get ngrok URL
Write-Host "🔍 Getting ngrok URL..." -ForegroundColor Green
try {
    $tunnels = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -ErrorAction Stop
    $NGROK_URL = $tunnels.tunnels[0].public_url
    
    if (-not $NGROK_URL -or $NGROK_URL -eq "null") {
        throw "Failed to get ngrok URL"
    }
} catch {
    Write-Host "❌ Failed to get ngrok URL. Check ngrok.log for details." -ForegroundColor Red
    Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "✅ Ngrok URL: $NGROK_URL" -ForegroundColor Green

# Update .env file
Write-Host "📝 Updating .env file..." -ForegroundColor Green
if (Test-Path ".env") {
    # Update existing .env file
    $envContent = Get-Content ".env" -Raw
    $envContent = $envContent -replace "TELEGRAM_WEBHOOK_URL=.*", "TELEGRAM_WEBHOOK_URL=$NGROK_URL"
    Set-Content ".env" $envContent
    Write-Host "✅ Updated existing .env file" -ForegroundColor Green
} else {
    # Create new .env file from template
    if (Test-Path "env-template.txt") {
        Copy-Item "env-template.txt" ".env"
        $envContent = Get-Content ".env" -Raw
        $envContent = $envContent -replace "TELEGRAM_WEBHOOK_URL=.*", "TELEGRAM_WEBHOOK_URL=$NGROK_URL"
        Set-Content ".env" $envContent
        Write-Host "✅ Created new .env file from template" -ForegroundColor Green
    } else {
        Write-Host "❌ No env-template.txt found. Please create .env manually with:" -ForegroundColor Red
        Write-Host "   TELEGRAM_WEBHOOK_URL=$NGROK_URL" -ForegroundColor Yellow
        Write-Host "   TELEGRAM_BOT_TOKEN=your_bot_token_here" -ForegroundColor Yellow
        Write-Host "   ENABLE_TELEGRAM=true" -ForegroundColor Yellow
    }
}

# Check if required env vars are set
Write-Host "🔍 Checking environment variables..." -ForegroundColor Green
$envContent = Get-Content ".env" -Raw

if ($envContent -notmatch "TELEGRAM_BOT_TOKEN") {
    Write-Host "⚠️  TELEGRAM_BOT_TOKEN not set in .env" -ForegroundColor Yellow
    Write-Host "   Please add your bot token to .env file" -ForegroundColor Yellow
}

if ($envContent -notmatch "ENABLE_TELEGRAM=true") {
    Write-Host "⚠️  ENABLE_TELEGRAM not set to true" -ForegroundColor Yellow
    Write-Host "   Adding ENABLE_TELEGRAM=true to .env" -ForegroundColor Yellow
    Add-Content ".env" "ENABLE_TELEGRAM=true"
}

# Show current setup
Write-Host ""
Write-Host "📋 Current Setup:" -ForegroundColor Cyan
Write-Host "   Ngrok URL: $NGROK_URL" -ForegroundColor White
Write-Host "   Webhook Endpoint: $NGROK_URL/api/telegram-webhook" -ForegroundColor White
Write-Host "   Ngrok Dashboard: http://localhost:4040" -ForegroundColor White
Write-Host ""

# Function to cleanup on exit
function Cleanup {
    Write-Host ""
    Write-Host "🧹 Cleaning up..." -ForegroundColor Yellow
    Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Host "✅ Cleanup complete" -ForegroundColor Green
}

# Register cleanup function to run on script exit
trap { Cleanup; exit }

# Start the application
Write-Host "🚀 Starting Novi Bot application..." -ForegroundColor Green
Write-Host "   Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

# Start the app
npm start

# If we get here, the app has stopped
Write-Host ""
Write-Host "👋 Novi Bot stopped. Cleaning up..." -ForegroundColor Green
Cleanup 