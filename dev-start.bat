@echo off
setlocal enabledelayedexpansion

echo 🤖 Novi Bot Local Development Setup
echo ==================================

REM Check if ngrok is installed
where ngrok >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ ngrok not found. Please install it first:
    echo    npm install -g ngrok
    echo    or download from https://ngrok.com/download
    pause
    exit /b 1
)

REM Kill any existing ngrok processes
echo 🧹 Cleaning up existing ngrok processes...
taskkill /f /im ngrok.exe >nul 2>&1

REM Start ngrok in background
echo 🚀 Starting ngrok tunnel...
start /b ngrok http 3000 > ngrok.log 2>&1

REM Wait for ngrok to start
echo ⏳ Waiting for ngrok to start...
timeout /t 5 /nobreak >nul

REM Get ngrok URL using PowerShell
echo 🔍 Getting ngrok URL...
for /f "tokens=*" %%i in ('powershell -Command "try { (Invoke-RestMethod -Uri 'http://localhost:4040/api/tunnels').tunnels[0].public_url } catch { 'null' }"') do set NGROK_URL=%%i

if "%NGROK_URL%"=="null" (
    echo ❌ Failed to get ngrok URL. Check ngrok.log for details.
    taskkill /f /im ngrok.exe >nul 2>&1
    pause
    exit /b 1
)

echo ✅ Ngrok URL: %NGROK_URL%

REM Update .env file
echo 📝 Updating .env file...
if exist .env (
    REM Update existing .env file
    powershell -Command "(Get-Content .env) -replace 'TELEGRAM_WEBHOOK_URL=.*', 'TELEGRAM_WEBHOOK_URL=%NGROK_URL%' | Set-Content .env"
    echo ✅ Updated existing .env file
) else (
    REM Create new .env file from template
    if exist env-template.txt (
        copy env-template.txt .env >nul
        powershell -Command "(Get-Content .env) -replace 'TELEGRAM_WEBHOOK_URL=.*', 'TELEGRAM_WEBHOOK_URL=%NGROK_URL%' | Set-Content .env"
        echo ✅ Created new .env file from template
    ) else (
        echo ❌ No env-template.txt found. Please create .env manually with:
        echo    TELEGRAM_WEBHOOK_URL=%NGROK_URL%
        echo    TELEGRAM_BOT_TOKEN=your_bot_token_here
        echo    ENABLE_TELEGRAM=true
    )
)

REM Check if required env vars are set
echo 🔍 Checking environment variables...
findstr "TELEGRAM_BOT_TOKEN" .env >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  TELEGRAM_BOT_TOKEN not set in .env
    echo    Please add your bot token to .env file
)

findstr "ENABLE_TELEGRAM=true" .env >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  ENABLE_TELEGRAM not set to true
    echo    Adding ENABLE_TELEGRAM=true to .env
    echo ENABLE_TELEGRAM=true>> .env
)

REM Show current setup
echo.
echo 📋 Current Setup:
echo    Ngrok URL: %NGROK_URL%
echo    Webhook Endpoint: %NGROK_URL%/api/telegram-webhook
echo    Ngrok Dashboard: http://localhost:4040
echo.

REM Start the application
echo 🚀 Starting Novi Bot application...
echo    Press Ctrl+C to stop
echo.

REM Start the app
npm start

REM Cleanup on exit
echo.
echo 🧹 Cleaning up...
taskkill /f /im ngrok.exe >nul 2>&1
echo ✅ Cleanup complete
echo 👋 Novi Bot stopped.
pause 