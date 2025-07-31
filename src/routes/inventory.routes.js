const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventory.controller');

// Main inventory dashboard
router.get('/', inventoryController.getInventory);

// Products routes
router.get('/products', inventoryController.getProducts);
router.get('/products/:id', inventoryController.getProduct);
router.post('/products', inventoryController.createProduct);
router.put('/products/:id', inventoryController.updateProduct);
router.delete('/products/:id', inventoryController.deleteProduct);
router.put('/products/:id/stock', inventoryController.updateStock);

// Others routes
router.get('/others', inventoryController.getOthers);
router.get('/others/:id', inventoryController.getOther);
router.post('/others', inventoryController.createOther);
router.put('/others/:id', inventoryController.updateOther);
router.delete('/others/:id', inventoryController.deleteOther);

// Collections routes
router.get('/collections', inventoryController.getCollections);
router.post('/collections', inventoryController.createCollection);
router.put('/collections/:id', inventoryController.updateCollection);
router.delete('/collections/:id', inventoryController.deleteCollection);

// Collection items routes
router.get('/collections/:collectionId/items', inventoryController.getCollectionItems);
router.post('/collections/:collectionId/items', inventoryController.addItemToCollection);
router.delete('/collections/:collectionId/items/:itemId', inventoryController.removeItemFromCollection);

// Collection management page
router.get('/collection/:id', inventoryController.getCollectionManagement);
router.put('/collections/:id', inventoryController.updateCollection);

module.exports = router; 