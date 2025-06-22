// test-order-parser.js
const OrderParser = require('./src/services/OrderParser');

// Test cases for the new OrderParser
const testCases = [
  {
    name: "Basic Order Format",
    message: `John Doe
08012345678
123 Lekki Phase 1, Lagos
2 Cakes, 1 Pizza
Tomorrow`,
    expected: {
      customer_name: "John Doe",
      customer_phone: "08012345678",
      address: "123 Lekki Phase 1, Lagos",
      items: "2 Cakes, 1 Pizza",
      delivery_date: "2024-01-02" // Assuming today is 2024-01-01
    }
  },
  {
    name: "Labeled Format",
    message: `Name: Jane Smith
Phone: 09087654321
Address: 456 Victoria Island, Lagos
Items: 1 Birthday Cake, 2 Apology Jars
Date: Friday`,
    expected: {
      customer_name: "Jane Smith",
      customer_phone: "09087654321",
      address: "456 Victoria Island, Lagos",
      items: "1 Birthday Cake, 2 Apology Jars",
      delivery_date: "2024-01-05" // Assuming Friday is 2024-01-05
    }
  },
  {
    name: "Nigerian Address Format",
    message: `Adebayo Johnson
07055556666
Behind Shoprite, Ajah
3 Rice and Stew
Today`,
    expected: {
      customer_name: "Adebayo Johnson",
      customer_phone: "07055556666",
      address: "Behind Shoprite, Ajah",
      items: "3 Rice and Stew",
      delivery_date: "2024-01-01" // Today
    }
  },
  {
    name: "Complex Address",
    message: `Sarah Williams
08123456789
Plot 15, Block B, Phase 2, Sangotedo Estate, Lekki
1 Wedding Cake, 50 Cupcakes
Next week`,
    expected: {
      customer_name: "Sarah Williams",
      customer_phone: "08123456789",
      address: "Plot 15, Block B, Phase 2, Sangotedo Estate, Lekki",
      items: "1 Wedding Cake, 50 Cupcakes",
      delivery_date: "2024-01-08" // Next week
    }
  },
  {
    name: "Problematic Date Case - Month Day Year",
    message: `NAME: Oluwatobi Olajubu
PHONE NO: 07069412307
ADDRESS(include the State): 8, Obinna uzor crescent, canal estate okota, Lagos 
Anniversary jar
June 24 2025`,
    expected: {
      customer_name: "Oluwatobi Olajubu",
      customer_phone: "07069412307",
      address: "8, Obinna uzor crescent, canal estate okota, Lagos",
      items: "Anniversary jar",
      delivery_date: "2025-06-24" // June 24 2025
    }
  }
];

console.log('🧪 Testing OrderParser...\n');

let passedTests = 0;
let totalTests = testCases.length;

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  console.log('Input:', testCase.message);
  
  const result = OrderParser.parseOrder(testCase.message, 'Test User');
  
  if (result) {
    console.log('✅ Parsed successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
    
    // Check if all expected fields are present
    const missingFields = [];
    Object.keys(testCase.expected).forEach(field => {
      if (!result[field]) {
        missingFields.push(field);
      }
    });
    
    if (missingFields.length === 0) {
      console.log('✅ All expected fields present');
      passedTests++;
    } else {
      console.log('❌ Missing fields:', missingFields);
    }
  } else {
    console.log('❌ Failed to parse order');
  }
  
  console.log('---\n');
});

console.log(`📊 Test Results: ${passedTests}/${totalTests} tests passed`);

if (passedTests === totalTests) {
  console.log('🎉 All tests passed! OrderParser is working correctly.');
} else {
  console.log('⚠️  Some tests failed. Please check the OrderParser implementation.');
} 