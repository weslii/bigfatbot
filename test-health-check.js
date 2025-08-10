// Test script to verify health check endpoints
const http = require('http');

function testHealthCheck(port, service) {
  const options = {
    hostname: 'localhost',
    port: port,
    path: '/health',
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    console.log(`✅ ${service} health check: ${res.statusCode}`);
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      try {
        const response = JSON.parse(data);
        console.log(`📊 ${service} response:`, response);
      } catch (e) {
        console.log(`📊 ${service} response:`, data);
      }
    });
  });

  req.on('error', (error) => {
    console.log(`❌ ${service} health check failed:`, error.message);
  });

  req.end();
}

// Test both services
console.log('🧪 Testing health check endpoints...');
testHealthCheck(3000, 'Web Service');
testHealthCheck(3001, 'Bot Service');
