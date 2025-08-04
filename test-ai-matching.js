const InventoryMatchingService = require('./src/services/InventoryMatchingService');
const { parseOrderWithAI, matchItemWithAI } = require('./src/services/AIPoweredOrderParser');
const logger = require('./src/utils/logger');

// Mock inventory for testing
const mockInventory = [
  { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Chocolate Cake', price: '5000', type: 'product' },
  { id: '550e8400-e29b-41d4-a716-446655440002', name: 'Vanilla Cake', price: '4000', type: 'product' },
  { id: '550e8400-e29b-41d4-a716-446655440003', name: 'Pizza Margherita', price: '3000', type: 'product' },
  { id: '550e8400-e29b-41d4-a716-446655440004', name: 'Pepperoni Pizza', price: '3500', type: 'product' },
  { id: '550e8400-e29b-41d4-a716-446655440005', name: 'Red Velvet Cake', price: '6000', type: 'product' },
  { id: '550e8400-e29b-41d4-a716-446655440006', name: 'Birthday Cake', price: '7000', type: 'product' },
  { id: '550e8400-e29b-41d4-a716-446655440007', name: 'Wedding Cake', price: '15000', type: 'product' },
  { id: '550e8400-e29b-41d4-a716-446655440008', name: 'Cupcake', price: '500', type: 'product' },
  { id: '550e8400-e29b-41d4-a716-446655440009', name: 'Brownie', price: '800', type: 'product' },
  { id: '550e8400-e29b-41d4-a716-446655440010', name: 'Cheesecake', price: '4500', type: 'product' }
];

async function testAIMatching() {
  console.log('🧪 Testing AI Matching Functionality...\n');

  try {
    const matchingService = new InventoryMatchingService();
    
    // Test cases with different scenarios
    const testCases = [
      {
        name: 'Exact Match',
        item: { name: 'Chocolate Cake', quantity: 2 },
        expectedMatch: 'Chocolate Cake',
        description: 'Should find exact match'
      },
      {
        name: 'Partial Match',
        item: { name: 'Chocolate', quantity: 1 },
        expectedMatch: 'Chocolate Cake',
        description: 'Should find partial match'
      },
      {
        name: 'Similar Name',
        item: { name: 'Choc Cake', quantity: 1 },
        expectedMatch: 'Chocolate Cake',
        description: 'Should find similar name'
      },
      {
        name: 'Different Wording',
        item: { name: 'Pizza', quantity: 1 },
        expectedMatch: 'Pizza Margherita',
        description: 'Should find pizza variant'
      },
      {
        name: 'Cake Variant',
        item: { name: 'Birthday', quantity: 1 },
        expectedMatch: 'Birthday Cake',
        description: 'Should find birthday cake'
      },
      {
        name: 'No Match',
        item: { name: 'Sushi', quantity: 1 },
        expectedMatch: null,
        description: 'Should return null for no match'
      },
      {
        name: 'Case Insensitive',
        item: { name: 'CHOCOLATE CAKE', quantity: 1 },
        expectedMatch: 'Chocolate Cake',
        description: 'Should handle case insensitive matching'
      },
      {
        name: 'Plural Form',
        item: { name: 'Cupcakes', quantity: 3 },
        expectedMatch: 'Cupcake',
        description: 'Should handle plural forms'
      }
    ];

    console.log('📋 Running AI Matching Tests:\n');

    for (const testCase of testCases) {
      console.log(`🔍 Testing: ${testCase.name}`);
      console.log(`   Description: ${testCase.description}`);
      console.log(`   Input: "${testCase.item.name}" (${testCase.item.quantity})`);
      
      try {
        const result = await matchingService.aiMatch(testCase.item, mockInventory);
        
        if (result) {
          console.log(`   ✅ AI Match Found: "${result.item.name}" (Confidence: ${result.confidence.toFixed(2)})`);
          
          if (testCase.expectedMatch && result.item.name === testCase.expectedMatch) {
            console.log(`   🎯 Expected Match: ✅ Correct`);
          } else if (testCase.expectedMatch) {
            console.log(`   ⚠️ Expected Match: ❌ Expected "${testCase.expectedMatch}", got "${result.item.name}"`);
          }
        } else {
          console.log(`   ❌ No AI Match Found`);
          
          if (testCase.expectedMatch === null) {
            console.log(`   🎯 Expected Result: ✅ Correct (no match expected)`);
          } else {
            console.log(`   ⚠️ Expected Result: ❌ Expected "${testCase.expectedMatch}", but no match found`);
          }
        }
      } catch (error) {
        console.log(`   💥 Error: ${error.message}`);
      }
      
      console.log(''); // Empty line for readability
    }

    // Test the full matching workflow
    console.log('🔄 Testing Full Matching Workflow:\n');
    
    const testOrderData = {
      customer_name: 'Test Customer',
      customer_phone: '08012345678',
      address: 'Test Address',
      items: '2 Chocolate Cakes, 1 Pizza, 3 Cupcakes',
      delivery_date: '2024-01-15'
    };

    try {
      const matchingResult = await matchingService.matchOrderItems(testOrderData, '550e8400-e29b-41d4-a716-446655440000');
      
      console.log('📊 Full Matching Result:');
      console.log(`   Status: ${matchingResult.status}`);
      console.log(`   Confidence: ${matchingResult.confidence.toFixed(2)}`);
      console.log(`   Total Revenue: ₦${matchingResult.totalRevenue}`);
      console.log(`   Matched Items: ${matchingResult.matchedItems.length}`);
      
      if (matchingResult.matchedItems.length > 0) {
        console.log('\n   📋 Matched Items:');
        matchingResult.matchedItems.forEach((item, index) => {
          console.log(`   ${index + 1}. ${item.originalItem.name} → ${item.matchedItem.name} (₦${item.totalPrice})`);
        });
      }
    } catch (error) {
      console.log(`   💥 Full workflow error: ${error.message}`);
    }

    // Test AI prompt generation
    console.log('\n🤖 Testing AI Prompt Generation:\n');
    
    const testItem = { name: 'Chocolate Cake', quantity: 2 };
    const inventoryList = mockInventory.map(i => `${i.name} (${i.type})`).join(', ');
    const expectedPrompt = `Given this item: "${testItem.name}" and these inventory items: ${inventoryList}, which inventory item best matches? Return only the exact inventory item name and a confidence score (0-1). Format: "item_name|confidence_score"`;
    
    console.log('📝 Generated AI Prompt:');
    console.log(`   ${expectedPrompt.substring(0, 100)}...`);
    console.log(`   Prompt Length: ${expectedPrompt.length} characters`);
    console.log(`   Inventory Items: ${mockInventory.length} items`);

    console.log('\n✅ AI Matching Test Complete!');

  } catch (error) {
    console.error('❌ AI Matching test failed:', error);
  }
}

// Run the test
testAIMatching().then(() => {
  console.log('\n🏁 AI matching test completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 AI matching test failed:', error);
  process.exit(1);
}); 