// test-memory-usage.js
// Test script to demonstrate memory usage patterns

const WhatsAppService = require('./src/services/WhatsAppService');
const memoryMonitor = require('./src/utils/memoryMonitor');

async function testMemoryUsage() {
  console.log('🧪 Testing Memory Usage Patterns\n');
  
  // Start memory monitoring
  memoryMonitor.start(30000); // Check every 30 seconds for testing
  
  console.log('📊 Initial memory usage:');
  const initialMemory = memoryMonitor.getMemoryUsage();
  console.log(initialMemory);
  
  // Simulate different scenarios
  console.log('\n🔍 Testing different memory usage scenarios:\n');
  
  // 1. Test with many unread messages (should be minimal impact)
  console.log('1️⃣ Testing with 1000 unread messages...');
  await simulateUnreadMessages(1000);
  await wait(2000);
  
  // 2. Test with message history (should have medium impact)
  console.log('\n2️⃣ Testing with 500 message history...');
  await simulateMessageHistory(500);
  await wait(2000);
  
  // 3. Test with media files (should have high impact)
  console.log('\n3️⃣ Testing with 50 media files...');
  await simulateMediaFiles(50);
  await wait(2000);
  
  // 4. Test with event listeners (should have medium impact)
  console.log('\n4️⃣ Testing with 1000 event listeners...');
  await simulateEventListeners(1000);
  await wait(2000);
  
  console.log('\n📈 Final memory usage:');
  const finalMemory = memoryMonitor.getMemoryUsage();
  console.log(finalMemory);
  
  console.log('\n📊 Memory increase:');
  console.log(`RSS: +${finalMemory.rss - initialMemory.rss}MB`);
  console.log(`Heap Used: +${finalMemory.heapUsed - initialMemory.heapUsed}MB`);
  console.log(`External: +${finalMemory.external - initialMemory.external}MB`);
  
  // Stop monitoring
  memoryMonitor.stop();
  process.exit(0);
}

async function simulateUnreadMessages(count) {
  // Simulate unread message metadata (very lightweight)
  const unreadMessages = [];
  for (let i = 0; i < count; i++) {
    unreadMessages.push({
      id: `msg_${i}`,
      from: `user_${i % 10}`,
      timestamp: Date.now(),
      isUnread: true
    });
  }
  
  console.log(`   Created ${count} unread message objects`);
  console.log(`   Memory impact: ~${Math.round(JSON.stringify(unreadMessages).length / 1024)}KB`);
  
  // Clear after test
  unreadMessages.length = 0;
}

async function simulateMessageHistory(count) {
  // Simulate processed message history (medium weight)
  const messageHistory = [];
  for (let i = 0; i < count; i++) {
    messageHistory.push({
      id: `msg_${i}`,
      from: `user_${i % 10}`,
      body: `This is message number ${i} with some content to simulate real message data. It includes customer information, order details, and other business data that would be processed by the bot.`,
      timestamp: Date.now(),
      processed: true,
      orderData: {
        customer_name: `Customer ${i}`,
        items: `Item ${i}, Item ${i + 1}`,
        status: 'pending'
      }
    });
  }
  
  console.log(`   Created ${count} message history objects`);
  console.log(`   Memory impact: ~${Math.round(JSON.stringify(messageHistory).length / 1024)}KB`);
  
  // Clear after test
  messageHistory.length = 0;
}

async function simulateMediaFiles(count) {
  // Simulate media file buffers (high weight)
  const mediaFiles = [];
  for (let i = 0; i < count; i++) {
    // Simulate 1MB image buffer
    const buffer = Buffer.alloc(1024 * 1024, 'A');
    mediaFiles.push({
      id: `media_${i}`,
      type: 'image',
      buffer: buffer,
      size: buffer.length
    });
  }
  
  console.log(`   Created ${count} media file buffers (1MB each)`);
  console.log(`   Memory impact: ~${count}MB`);
  
  // Clear after test
  mediaFiles.length = 0;
}

async function simulateEventListeners(count) {
  // Simulate event listeners (medium weight)
  const listeners = [];
  for (let i = 0; i < count; i++) {
    const listener = (data) => {
      // Simulate event handler
      console.log(`Event ${i}:`, data);
    };
    listeners.push(listener);
  }
  
  console.log(`   Created ${count} event listeners`);
  console.log(`   Memory impact: ~${Math.round(count * 0.1)}KB`);
  
  // Clear after test
  listeners.length = 0;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the test
testMemoryUsage().catch(console.error); 