const InventoryService = require('../services/InventoryService');
const logger = require('../utils/logger');
const db = require('../config/database');

class InventoryController {
  // Get inventory dashboard
  async getInventory(req, res) {
    try {
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.redirect('/login');
      }

      // Check if user is active
      const user = await db.query('users').where('id', userId).select('is_active').first();
      if (!user || !user.is_active) {
        req.session.destroy();
        return res.render('error', { error: 'Your account has been deactivated. Please contact support.' });
      }

      // Get user's business ID from groups table
      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.render('error', { error: 'No business found for this user. Please set up a business first.' });
      }

      const businessId = userGroup.business_id;
      const { search, filter } = req.query;
      
      let inventory = [];
      
      if (search) {
        inventory = await InventoryService.searchInventory(businessId, search, filter);
      } else {
        const [products, others, collections] = await Promise.all([
          InventoryService.getAllProducts(businessId),
          InventoryService.getAllOthers(businessId),
          InventoryService.getAllCollections(businessId)
        ]);
        
        // Get collection items for each collection
        const collectionsWithItems = await Promise.all(
          collections.map(async (collection) => {
            const items = await InventoryService.getCollectionItems(collection.id, businessId);
            return {
              ...collection,
              type: 'collection',
              items: items
            };
          })
        );
        
        // Get collection information for products and others to show price overrides
        const productsWithCollections = await Promise.all(
          products.map(async (product) => {
            const collectionItems = await db.query('collection_items as ci')
              .select('ci.price_override', 'c.name as collection_name', 'c.price as collection_price')
              .leftJoin('collections as c', 'ci.collection_id', 'c.id')
              .where('ci.product_id', product.id)
              .first();
            
            return {
              ...product,
              type: 'product',
              price_override: collectionItems?.price_override || null,
              collection_name: collectionItems?.collection_name || null,
              collection_price: collectionItems?.collection_price || null
            };
          })
        );

        const othersWithCollections = await Promise.all(
          others.map(async (other) => {
            const collectionItems = await db.query('collection_items as ci')
              .select('ci.price_override', 'c.name as collection_name', 'c.price as collection_price')
              .leftJoin('collections as c', 'ci.collection_id', 'c.id')
              .where('ci.other_id', other.id)
              .first();
            
            return {
              ...other,
              type: 'other',
              price_override: collectionItems?.price_override || null,
              collection_name: collectionItems?.collection_name || null,
              collection_price: collectionItems?.collection_price || null
            };
          })
        );

        inventory = [
          ...productsWithCollections,
          ...othersWithCollections,
          ...collectionsWithItems
        ];
      }

      // Apply filter if specified
      if (filter && filter !== 'all') {
        if (filter === 'outofstock') {
          // Filter to only show out of stock products
          inventory = inventory.filter(item => 
            item.type === 'product' && item.stock_count <= 0
          );
        } else {
          // Filter by item type
          inventory = inventory.filter(item => item.type === filter);
        }
      }
      
      const summary = await InventoryService.getInventorySummary(businessId);
      const outOfStock = await InventoryService.getOutOfStockProducts(businessId);
      
             res.render('inventory', {
         user: { business_name: userGroup.business_name },
         page: 'inventory',
         inventory,
         summary,
         outOfStock,
         search: search || '',
         filter: filter || 'all'
       });
    } catch (error) {
      logger.error('Error getting inventory:', error);
      res.status(500).json({ error: 'Failed to load inventory' });
    }
  }

  // Products
  async getProducts(req, res) {
    try {
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.status(404).json({ error: 'No business found for this user' });
      }

      const businessId = userGroup.business_id;
      const products = await InventoryService.getAllProducts(businessId);
      res.json(products);
    } catch (error) {
      logger.error('Error getting products:', error);
      res.status(500).json({ error: 'Failed to load products' });
    }
  }

  async createProduct(req, res) {
    try {
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.status(404).json({ error: 'No business found for this user' });
      }

      const businessId = userGroup.business_id;
      const productData = {
        ...req.body,
        business_id: businessId
      };
      
      const product = await InventoryService.createProduct(productData);
      
      // Clear inventory cache for this business (singleton)
      try {
        const InventoryCache = require('../services/MemoryOptimizedInventoryService');
        InventoryCache.clearCacheForBusiness(businessId);
        logger.info('Cleared inventory cache for business:', businessId);
      } catch (cacheError) {
        logger.warn('Failed to clear inventory cache:', cacheError);
      }
      
      // Refresh bot confirmation inventory for this business
      try {
        const BotServiceManager = require('../services/BotServiceManager');
        const botManager = BotServiceManager.getInstance();
        const telegramService = botManager.getTelegramService();
        const whatsappService = botManager.getWhatsAppService();
        
        if (telegramService && telegramService.confirmationService) {
          await telegramService.confirmationService.refreshAllConfirmationsForBusiness(businessId);
        }
        if (whatsappService && whatsappService.confirmationService) {
          await whatsappService.confirmationService.refreshAllConfirmationsForBusiness(businessId);
        }
      } catch (refreshError) {
        logger.warn('Failed to refresh bot confirmation inventory:', refreshError);
      }
      
      res.json(product[0]);
    } catch (error) {
      logger.error('Error creating product:', error);
      res.status(500).json({ error: 'Failed to create product' });
    }
  }

  async updateProduct(req, res) {
    try {
      const { id } = req.params;
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.status(404).json({ error: 'No business found for this user' });
      }

      const businessId = userGroup.business_id;
      
      const product = await InventoryService.updateProduct(id, businessId, req.body);
      res.json(product[0]);
    } catch (error) {
      logger.error('Error updating product:', error);
      res.status(500).json({ error: 'Failed to update product' });
    }
  }

  async deleteProduct(req, res) {
    try {
      const { id } = req.params;
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.status(404).json({ error: 'No business found for this user' });
      }

      const businessId = userGroup.business_id;
      
      await InventoryService.deleteProduct(id, businessId);
      
      // Clear inventory cache for this business (singleton)
      try {
        const InventoryCache = require('../services/MemoryOptimizedInventoryService');
        InventoryCache.clearCacheForBusiness(businessId);
        logger.info('Cleared inventory cache for business:', businessId);
      } catch (cacheError) {
        logger.warn('Failed to clear inventory cache:', cacheError);
      }
      
      // Refresh bot confirmation inventory for this business
      try {
        const BotServiceManager = require('../services/BotServiceManager');
        const botManager = BotServiceManager.getInstance();
        const telegramService = botManager.getTelegramService();
        const whatsappService = botManager.getWhatsAppService();
        
        if (telegramService && telegramService.confirmationService) {
          await telegramService.confirmationService.refreshAllConfirmationsForBusiness(businessId);
        }
        if (whatsappService && whatsappService.confirmationService) {
          await whatsappService.confirmationService.refreshAllConfirmationsForBusiness(businessId);
        }
      } catch (refreshError) {
        logger.warn('Failed to refresh bot confirmation inventory:', refreshError);
      }
      
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting product:', error);
      res.status(500).json({ error: 'Failed to delete product' });
    }
  }

  async getProduct(req, res) {
    try {
      const { id } = req.params;
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.status(404).json({ error: 'No business found for this user' });
      }

      const businessId = userGroup.business_id;
      
      // Check products table first
      const product = await db.query('products')
        .where({ id: id, business_id: businessId })
        .first();
      
      if (product) {
        return res.json(product);
      }
      
      // Check others table if not found in products
      const other = await db.query('others')
        .where({ id: id, business_id: businessId })
        .first();
      
      if (other) {
        return res.json(other);
      }
      
      return res.status(404).json({ error: 'Product not found' });
      
      res.json(product);
    } catch (error) {
      logger.error('Error getting product:', error);
      res.status(500).json({ error: 'Failed to get product' });
    }
  }

  // Others
  async getOthers(req, res) {
    try {
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.status(404).json({ error: 'No business found for this user' });
      }

      const businessId = userGroup.business_id;
      const others = await InventoryService.getAllOthers(businessId);
      res.json(others);
    } catch (error) {
      logger.error('Error getting others:', error);
      res.status(500).json({ error: 'Failed to load others' });
    }
  }

  async createOther(req, res) {
    try {
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.status(404).json({ error: 'No business found for this user' });
      }

      const businessId = userGroup.business_id;
      const otherData = {
        ...req.body,
        business_id: businessId
      };
      
      const other = await InventoryService.createOther(otherData);
      
      // Clear inventory cache for this business (singleton)
      try {
        const InventoryCache = require('../services/MemoryOptimizedInventoryService');
        InventoryCache.clearCacheForBusiness(businessId);
        logger.info('Cleared inventory cache for business:', businessId);
      } catch (cacheError) {
        logger.warn('Failed to clear inventory cache:', cacheError);
      }
      
      // Refresh bot confirmation inventory for this business
      try {
        const BotServiceManager = require('../services/BotServiceManager');
        const botManager = BotServiceManager.getInstance();
        const telegramService = botManager.getTelegramService();
        const whatsappService = botManager.getWhatsAppService();
        
        if (telegramService && telegramService.confirmationService) {
          await telegramService.confirmationService.refreshAllConfirmationsForBusiness(businessId);
        }
        if (whatsappService && whatsappService.confirmationService) {
          await whatsappService.confirmationService.refreshAllConfirmationsForBusiness(businessId);
        }
      } catch (refreshError) {
        logger.warn('Failed to refresh bot confirmation inventory:', refreshError);
      }
      
      res.json(other[0]);
    } catch (error) {
      logger.error('Error creating other:', error);
      res.status(500).json({ error: 'Failed to create other' });
    }
  }

  async updateOther(req, res) {
    try {
      const { id } = req.params;
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.status(404).json({ error: 'No business found for this user' });
      }

      const businessId = userGroup.business_id;
      
      const other = await InventoryService.updateOther(id, businessId, req.body);
      res.json(other[0]);
    } catch (error) {
      logger.error('Error updating other:', error);
      res.status(500).json({ error: 'Failed to update other' });
    }
  }

  async deleteOther(req, res) {
    try {
      const { id } = req.params;
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.status(404).json({ error: 'No business found for this user' });
      }

      const businessId = userGroup.business_id;
      
      await InventoryService.deleteOther(id, businessId);
      
      // Clear inventory cache for this business (singleton)
      try {
        const InventoryCache = require('../services/MemoryOptimizedInventoryService');
        InventoryCache.clearCacheForBusiness(businessId);
        logger.info('Cleared inventory cache for business:', businessId);
      } catch (cacheError) {
        logger.warn('Failed to clear inventory cache:', cacheError);
      }
      
      // Refresh bot confirmation inventory for this business
      try {
        const BotServiceManager = require('../services/BotServiceManager');
        const botManager = BotServiceManager.getInstance();
        const telegramService = botManager.getTelegramService();
        const whatsappService = botManager.getWhatsAppService();
        
        if (telegramService && telegramService.confirmationService) {
          await telegramService.confirmationService.refreshAllConfirmationsForBusiness(businessId);
        }
        if (whatsappService && whatsappService.confirmationService) {
          await whatsappService.confirmationService.refreshAllConfirmationsForBusiness(businessId);
        }
      } catch (refreshError) {
        logger.warn('Failed to refresh bot confirmation inventory:', refreshError);
      }
      
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting other:', error);
      res.status(500).json({ error: 'Failed to delete other' });
    }
  }

  async getOther(req, res) {
    try {
      const { id } = req.params;
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.status(404).json({ error: 'No business found for this user' });
      }

      const businessId = userGroup.business_id;
      
      const other = await db.query('others')
        .where({ id: id, business_id: businessId })
        .first();
      
      if (!other) {
        return res.status(404).json({ error: 'Other item not found' });
      }
      
      res.json(other);
    } catch (error) {
      logger.error('Error getting other:', error);
      res.status(500).json({ error: 'Failed to get other item' });
    }
  }

  // Collections
  async getCollections(req, res) {
    try {
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.status(404).json({ error: 'No business found for this user' });
      }

      const businessId = userGroup.business_id;
      const collections = await InventoryService.getAllCollections(businessId);
      res.json(collections);
    } catch (error) {
      logger.error('Error getting collections:', error);
      res.status(500).json({ error: 'Failed to load collections' });
    }
  }

  async createCollection(req, res) {
    try {
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.status(404).json({ error: 'No business found for this user' });
      }

      const businessId = userGroup.business_id;
      const collectionData = {
        ...req.body,
        business_id: businessId
      };
      
      const collection = await InventoryService.createCollection(collectionData);
      res.json(collection[0]);
    } catch (error) {
      logger.error('Error creating collection:', error);
      res.status(500).json({ error: 'Failed to create collection' });
    }
  }

  async updateCollection(req, res) {
    try {
      const { id } = req.params;
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.status(404).json({ error: 'No business found for this user' });
      }

      const businessId = userGroup.business_id;
      
      const collection = await InventoryService.updateCollection(id, businessId, req.body);
      res.json(collection[0]);
    } catch (error) {
      logger.error('Error updating collection:', error);
      res.status(500).json({ error: 'Failed to update collection' });
    }
  }

  async deleteCollection(req, res) {
    try {
      const { id } = req.params;
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.status(404).json({ error: 'No business found for this user' });
      }

      const businessId = userGroup.business_id;
      
      await InventoryService.deleteCollection(id, businessId);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting collection:', error);
      res.status(500).json({ error: 'Failed to delete collection' });
    }
  }

  // Collection Items
  async getCollectionItems(req, res) {
    try {
      const { collectionId } = req.params;
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.status(404).json({ error: 'No business found for this user' });
      }

      const businessId = userGroup.business_id;
      
      const items = await InventoryService.getCollectionItems(collectionId, businessId);
      res.json(items);
    } catch (error) {
      logger.error('Error getting collection items:', error);
      res.status(500).json({ error: 'Failed to load collection items' });
    }
  }

  async addItemToCollection(req, res) {
    try {
      const { collectionId } = req.params;
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.status(404).json({ error: 'No business found for this user' });
      }

      const businessId = userGroup.business_id;
      const itemData = req.body;
      
      const item = await InventoryService.addItemToCollection(collectionId, businessId, itemData);
      res.json(item[0]);
    } catch (error) {
      logger.error('Error adding item to collection:', error);
      res.status(500).json({ error: 'Failed to add item to collection' });
    }
  }

  async removeItemFromCollection(req, res) {
    try {
      const { collectionId, itemId } = req.params;
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.status(404).json({ error: 'No business found for this user' });
      }

      const businessId = userGroup.business_id;
      
      await InventoryService.removeItemFromCollection(collectionId, itemId, businessId);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error removing item from collection:', error);
      res.status(500).json({ error: 'Failed to remove item from collection' });
    }
  }

  // Stock management
  async updateStock(req, res) {
    try {
      const { id } = req.params;
      const { stock_count } = req.body;
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.status(404).json({ error: 'No business found for this user' });
      }

      const businessId = userGroup.business_id;
      
      const product = await InventoryService.updateStock(id, businessId, stock_count);
      res.json(product[0]);
    } catch (error) {
      logger.error('Error updating stock:', error);
      res.status(500).json({ error: 'Failed to update stock' });
    }
  }

  async getCollectionManagement(req, res) {
    try {
      const { id } = req.params;
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.redirect('/login');
      }

      // Check if user is active
      const user = await db.query('users').where('id', userId).select('is_active').first();
      if (!user || !user.is_active) {
        req.session.destroy();
        return res.render('error', { error: 'Your account has been deactivated. Please contact support.' });
      }

      // Get user's business ID from groups table
      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.render('error', { error: 'No business found for this user. Please set up a business first.' });
      }

      const businessId = userGroup.business_id;
      
      // Get collection details
      const collection = await InventoryService.getCollectionById(id, businessId);
      if (!collection) {
        return res.render('error', { error: 'Collection not found.' });
      }

      // Get collection items
      const collectionItems = await InventoryService.getCollectionItems(id, businessId);
      
      // Get available items based on collection type
      let availableProducts = [];
      let availableOthers = [];
      
      if (collection.type === 'product') {
        availableProducts = await InventoryService.getAllProducts(businessId);
      } else if (collection.type === 'other') {
        availableOthers = await InventoryService.getAllOthers(businessId);
      }

      res.render('collection-management', {
        user: { business_name: userGroup.business_name },
        page: 'collection-management',
        collection,
        collectionItems,
        availableProducts,
        availableOthers
      });
    } catch (error) {
      logger.error('Error getting collection management:', error);
      res.status(500).json({ error: 'Failed to load collection management' });
    }
  }

  async updateCollection(req, res) {
    try {
      const { id } = req.params;
      const { name, description, price } = req.body;
      const userId = req.session && req.session.userId ? String(req.session.userId) : null;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userGroup = await db.query('groups').where('user_id', userId).first();
      if (!userGroup) {
        return res.status(404).json({ error: 'No business found for this user' });
      }

      const businessId = userGroup.business_id;
      
      // Update collection
      const updatedCollection = await InventoryService.updateCollection(id, businessId, {
        name,
        description,
        price
      });

      res.json(updatedCollection[0]);
    } catch (error) {
      logger.error('Error updating collection:', error);
      res.status(500).json({ error: 'Failed to update collection' });
    }
  }
}

module.exports = new InventoryController(); 