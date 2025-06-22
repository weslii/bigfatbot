// test-messages.js
const MessageService = require('./src/services/MessageService');

// Sample order data
const sampleOrder = {
  order_id: "ORD-2025-001",
  customer_name: "Oluwatobi Olajubu",
  customer_phone: "07069412307",
  address: "8, Obinna uzor crescent, canal estate okota, Lagos",
  items: "Anniversary jar",
  delivery_date: "2025-06-24",
  notes: "Handle with care - fragile item",
  status: "pending",
  created_at: new Date()
};

console.log('📱 SAMPLE ORDER MESSAGES\n');
console.log('=' .repeat(50));
console.log('🛍️ SALES GROUP CONFIRMATION:');
console.log('=' .repeat(50));
console.log(MessageService.formatSalesConfirmation(sampleOrder));
console.log('\n');

console.log('=' .repeat(50));
console.log('✅ DELIVERY GROUP CONFIRMATION:');
console.log('=' .repeat(50));
console.log(MessageService.formatOrderConfirmation(sampleOrder));
console.log('\n');

console.log('=' .repeat(50));
console.log('📋 PENDING ORDERS LIST:');
console.log('=' .repeat(50));
console.log(MessageService.formatPendingOrders([sampleOrder]));
console.log('\n');

console.log('=' .repeat(50));
console.log('📊 DAILY REPORT:');
console.log('=' .repeat(50));
const sampleReport = {
  total_orders: 15,
  delivered_orders: 12,
  cancelled_orders: 1,
  scheduled_deliveries: 2
};
console.log(MessageService.formatDailyReport(sampleReport));
console.log('\n');

console.log('=' .repeat(50));
console.log('❓ HELP MESSAGE:');
console.log('=' .repeat(50));
console.log(MessageService.formatHelpMessage()); 