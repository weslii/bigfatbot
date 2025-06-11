@echo off
echo Starting WhatsApp Delivery Bot...
echo.

echo Installing dependencies...
call npm install
echo.

echo Running database migrations...
call npx knex migrate:latest
echo.

echo Starting the server...
echo Server will be available at http://localhost:3000
echo Press Ctrl+C to stop the server
echo.

node src/server.js 