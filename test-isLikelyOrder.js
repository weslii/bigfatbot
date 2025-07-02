const WhatsAppService = require('./src/services/WhatsAppService');

const testCases = [
  {
    name: 'GRACE OLATUNJI',
    message: `Name:GRACE OLATUNJI\nPhone no: +23409030405606\nAddress: 47 OMILADE MAFOLUKU OSHODI LAGOS\nApologies jar(with customized songs)\nadd this link https://open.spotify.com/playlist/0eUVrWaGTjIWTq1ZPXDBHD?si=c67fbabb6e4a476f`
  },
  {
    name: 'Hay2blogistics',
    message: `Name: Hay2blogistics \nPhone no: 09011207592\nAddress: Iwo Road Ibadan \nAnniversary jar\nthis is the link for the custom \nhttps://open.spotify.com/playlist/0eUVrWaGTjIWTq1ZPXDBHD?si=c67fbabb6e4a476f\nthen he also wants to make a custom card.\nto be delivered on the 23rd`
  },
  // Add more test cases as needed
];

const service = WhatsAppService.getInstance();

console.log('Testing isLikelyOrder for various messages...');
testCases.forEach((test, idx) => {
  const result = service.isLikelyOrder(test.message);
  console.log(`\nTest ${idx + 1}: ${test.name}`);
  console.log('Input:', test.message);
  console.log('isLikelyOrder output:', result);
}); 