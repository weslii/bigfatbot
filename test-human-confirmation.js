const HumanConfirmationService = require('./src/services/HumanConfirmationService');
const OrderService = require('./src/services/OrderService');
const InventoryMatchingService = require('./src/services/InventoryMatchingService');
const database = require('./src/config/database');
const logger = require('./src/utils/logger');

// Mock core service for testing
class MockCoreService {
  constructor() {
    this.sentMessages = [];
  }
  
  async sendMessage(groupId, message) {
    this.sentMessages.push({ groupId, message });
    console.log(`📤 [${groupId}] ${message}`);
    return { message_id: Date.now() };
  }
}

async function testHumanConfirmation() {
  console.log('🧪 Testing Human Confirmation Service...\n');

  try {
    const mockCore = new MockCoreService();
    const confirmationService = new HumanConfirmationService(mockCore);
    
    // Test 1: Request item confirmation
    console.log('1. Testing Item Confirmation Request:');
    const testItem = { name: 'Chocolate Cake', quantity: 2 };
    const testInventory = [
      { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Chocolate Cake', price: '5000', type: 'product' },
      { id: '550e8400-e29b-41d4-a716-446655440002', name: 'Vanilla Cake', price: '4000', type: 'product' },
      { id: '550e8400-e29b-41d4-a716-446655440003', name: 'Pizza', price: '3000', type: 'product' }
    ];
    
    await confirmationService.requestItemConfirmation(
      testItem,
      '550e8400-e29b-41d4-a716-446655440000',
      'test-group-id',
      testInventory
    );
    
    console.log(`   ✅ Confirmation request sent`);
    console.log(`   📊 Pending confirmations: ${confirmationService.getPendingConfirmationsCount()}`);

    // Test 2: Handle Telegram confirmation response
    console.log('\n2. Testing Telegram Confirmation Response:');
    const telegramMessage = {
      text: 'yes',
      reply_to_message: { message_id: 123 }
    };
    
    const telegramResult = await confirmationService.handleConfirmationResponse(
      telegramMessage,
      'test-group-id'
    );
    
    console.log(`   ✅ Telegram response handled: ${telegramResult}`);

    // Test 3: Handle WhatsApp confirmation response
    console.log('\n3. Testing WhatsApp Confirmation Response:');
    const whatsappMessage = {
      body: 'no',
      hasQuotedMsg: true
    };
    
    const whatsappResult = await confirmationService.handleConfirmationResponse(
      whatsappMessage,
      'test-group-id'
    );
    
    console.log(`   ✅ WhatsApp response handled: ${whatsappResult}`);

    // Test 4: Handle new item response
    console.log('\n4. Testing New Item Response:');
    const newItemMessage = {
      body: 'yes'
    };
    
    const newItemResult = await confirmationService.handleNewItemResponse(
      newItemMessage,
      'test-group-id'
    );
    
    console.log(`   ✅ New item response handled: ${newItemResult}`);

    // Test 5: Handle item details response
    console.log('\n5. Testing Item Details Response:');
    const itemDetailsMessage = {
      text: `Name: Red Velvet Cake
Price: 6000
Type: product`
    };
    
    const itemDetailsResult = await confirmationService.handleItemDetailsResponse(
      itemDetailsMessage,
      'test-group-id'
    );
    
    console.log(`   ✅ Item details response handled: ${itemDetailsResult}`);

    // Test 6: Test OrderService integration
    console.log('\n6. Testing OrderService Integration:');
    // Note: OrderService is used statically, so we don't instantiate it
    // The integration is tested through the actual order creation process
    
    const testOrderData = {
      customer_name: 'Test Customer',
      customer_phone: '08012345678',
      address: 'Test Address',
      items: '2 Chocolate Cakes',
      delivery_date: '2024-01-15'
    };
    
         try {
       const order = await OrderService.createOrder(
         '550e8400-e29b-41d4-a716-446655440000',
         testOrderData,
         confirmationService
       );
       
       console.log(`   ✅ Order created with ID: ${order.order_id}`);
       console.log(`   📊 Order status: ${order.matching_status}`);
       console.log(`   💰 Total revenue: ₦${order.total_revenue}`);
     } catch (error) {
       console.log(`   ⚠️ Order creation test: ${error.message}`);
     }

    // Test 7: Test InventoryMatchingService integration
    console.log('\n7. Testing InventoryMatchingService Integration:');
    const matchingService = new InventoryMatchingService();
    
    const matchingResult = await matchingService.matchOrderItems(
      testOrderData,
      '550e8400-e29b-41d4-a716-446655440000'
    );
    
    console.log(`   ✅ Matching result:`, {
      status: matchingResult.status,
      confidence: matchingResult.confidence,
      totalRevenue: matchingResult.totalRevenue,
      matchedItemsCount: matchingResult.matchedItems.length
    });

    console.log('\n✅ Human Confirmation Service Test Complete!');
    
    // Summary
    console.log('\n📊 Test Summary:');
    console.log(`- Messages sent: ${mockCore.sentMessages.length}`);
    console.log(`- Pending confirmations: ${confirmationService.getPendingConfirmationsCount()}`);
    console.log(`- Cache efficiency: ${confirmationService.getCacheEfficiency ? confirmationService.getCacheEfficiency() : 'N/A'}%`);

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testHumanConfirmation().then(() => {
  console.log('\n🏁 Human confirmation test completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Human confirmation test failed:', error);
  process.exit(1);
}); 