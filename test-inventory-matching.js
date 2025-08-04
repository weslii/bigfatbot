const InventoryMatchingService = require('./src/services/InventoryMatchingService');
const EnhancedItemExtractor = require('./src/services/EnhancedItemExtractor');
const MemoryOptimizedInventoryService = require('./src/services/MemoryOptimizedInventoryService');
const AdaptiveConfidenceService = require('./src/services/AdaptiveConfidenceService');
const inventoryMemoryMonitor = require('./src/utils/inventoryMemoryMonitor');

async function testInventoryMatching() {
  console.log('🧪 Testing Inventory Matching System...\n');

  try {
    // Test item extraction
    console.log('1. Testing Item Extraction:');
    const testItems = [
      '2 Cakes, 1 Pizza',
      'Cake x2, Pizza x1',
      '2x Cake, 1x Pizza',
      'Cake 2, Pizza 1',
      'Single Item'
    ];

    for (const itemText of testItems) {
      const extracted = EnhancedItemExtractor.extractItemsWithQuantities(itemText);
      console.log(`   "${itemText}" -> ${extracted.map(i => `${i.quantity}x ${i.name}`).join(', ')}`);
    }

    // Test inventory service
    console.log('\n2. Testing Inventory Service:');
    const inventoryService = new MemoryOptimizedInventoryService();
    
    // Get a sample business ID (you'll need to replace this with a real one)
    const sampleBusinessId = '550e8400-e29b-41d4-a716-446655440000'; // Replace with real business ID
    
    try {
      const inventory = await inventoryService.getBusinessInventoryOptimized(sampleBusinessId);
      console.log(`   Found ${inventory.length} inventory items`);
      
      if (inventory.length > 0) {
        console.log(`   Sample items: ${inventory.slice(0, 3).map(i => i.name).join(', ')}`);
      }
    } catch (error) {
      console.log(`   Error fetching inventory: ${error.message}`);
    }

    // Test confidence service
    console.log('\n3. Testing Confidence Service:');
    const confidenceService = new AdaptiveConfidenceService();
    
    try {
      const thresholds = await confidenceService.getAdaptiveThresholds(sampleBusinessId);
      console.log(`   Adaptive thresholds:`, thresholds);
    } catch (error) {
      console.log(`   Error getting thresholds: ${error.message}`);
    }

    // Test matching service
    console.log('\n4. Testing Matching Service:');
    const matchingService = new InventoryMatchingService();
    
    const testOrderData = {
      customer_name: 'Test Customer',
      customer_phone: '08012345678',
      address: 'Test Address',
      items: '2 Cakes, 1 Pizza',
      delivery_date: '2024-01-15'
    };

    try {
      const result = await matchingService.matchOrderItems(testOrderData, sampleBusinessId);
      console.log(`   Matching result:`, {
        status: result.status,
        totalRevenue: result.totalRevenue,
        confidence: result.confidence,
        matchedItemsCount: result.matchedItems.length
      });
    } catch (error) {
      console.log(`   Error in matching: ${error.message}`);
    }

    console.log('\n✅ Inventory Matching System Test Complete!');
    
    // Log memory usage
    console.log('\n📊 Memory Usage:');
    const memoryStats = inventoryMemoryMonitor.getMemoryStats();
    console.log('- RSS:', memoryStats.rss, 'MB');
    console.log('- Heap Used:', memoryStats.heapUsed, 'MB');
    console.log('- Heap Total:', memoryStats.heapTotal, 'MB');
    console.log('- Cache Hit Rate:', memoryStats.cacheHitRate + '%');
    console.log('- Cache Hits:', memoryStats.cacheHits);
    console.log('- Cache Misses:', memoryStats.cacheMisses);

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testInventoryMatching().then(() => {
  console.log('\n🏁 Test completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test failed:', error);
  process.exit(1);
}); 