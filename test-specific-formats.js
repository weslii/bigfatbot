const HumanConfirmationService = require('./src/services/HumanConfirmationService');

// Create a mock core service for testing
const mockCoreService = {
  sendMessage: () => Promise.resolve()
};

const humanConfirmationService = new HumanConfirmationService(mockCoreService);

// Test the specific formats the user asked about
const testCases = [
  "jug\n6,000\nproduct",
  "jug \n6000"
];

console.log('🧪 Testing Specific User Formats\n');

testCases.forEach((testCase, index) => {
  console.log(`\n--- Test ${index + 1} ---`);
  console.log(`Input: "${testCase}"`);
  
  const result = humanConfirmationService.parseItemDetails(testCase);
  
  console.log(`Result:`);
  console.log(`  Name: "${result.name || 'MISSING'}"`);
  console.log(`  Price: ${result.price || 'MISSING'}`);
  console.log(`  Type: "${result.type || 'MISSING'}"`);
  
  const isValid = result.name && result.price;
  console.log(`  Valid: ${isValid ? '✅' : '❌'}`);
}); 