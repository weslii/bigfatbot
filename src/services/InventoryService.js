const database = require('../config/database');

class InventoryService {
  // Products (reducible items)
  async getAllProducts(businessId) {
    return database.query('products')
      .where('business_id', businessId)
      .orderBy('name');
  }

  async getProductById(id, businessId) {
    return database.query('products')
      .where({ id, business_id: businessId })
      .first();
  }

  async createProduct(productData) {
    return database.query('products').insert(productData).returning('*');
  }

  async updateProduct(id, businessId, updateData) {
    updateData.updated_at = database.query.fn.now();
    return database.query('products')
      .where({ id, business_id: businessId })
      .update(updateData)
      .returning('*');
  }

  async deleteProduct(id, businessId) {
    return database.query('products')
      .where({ id, business_id: businessId })
      .del();
  }

  async updateStock(id, businessId, quantity) {
    return database.query('products')
      .where({ id, business_id: businessId })
      .increment('stock_count', quantity)
      .returning('*');
  }

  // Others (non-reducible items)
  async getAllOthers(businessId) {
    return database.query('others')
      .where('business_id', businessId)
      .orderBy('name');
  }

  async getOtherById(id, businessId) {
    return database.query('others')
      .where({ id, business_id: businessId })
      .first();
  }

  async createOther(otherData) {
    return database.query('others').insert(otherData).returning('*');
  }

  async updateOther(id, businessId, updateData) {
    updateData.updated_at = database.query.fn.now();
    return database.query('others')
      .where({ id, business_id: businessId })
      .update(updateData)
      .returning('*');
  }

  async deleteOther(id, businessId) {
    return database.query('others')
      .where({ id, business_id: businessId })
      .del();
  }

  // Collections
  async getAllCollections(businessId) {
    return database.query('collections')
      .where('business_id', businessId)
      .orderBy('name');
  }

  async getCollectionById(id, businessId) {
    return database.query('collections')
      .where({ id, business_id: businessId })
      .first();
  }

  async createCollection(collectionData) {
    return database.query('collections').insert(collectionData).returning('*');
  }

  async updateCollection(id, businessId, updateData) {
    updateData.updated_at = database.query.fn.now();
    return database.query('collections')
      .where({ id, business_id: businessId })
      .update(updateData)
      .returning('*');
  }

  async deleteCollection(id, businessId) {
    return database.query('collections')
      .where({ id, business_id: businessId })
      .del();
  }

  // Collection Items
  async getCollectionItems(collectionId, businessId) {
    return database.query('collection_items as ci')
      .select(
        'ci.*',
        'p.name as product_name',
        'p.price as product_price',
        'o.name as other_name',
        'o.price as other_price'
      )
      .leftJoin('products as p', 'ci.product_id', 'p.id')
      .leftJoin('others as o', 'ci.other_id', 'o.id')
      .where('ci.collection_id', collectionId)
      .orderBy('ci.created_at');
  }

  async addItemToCollection(collectionId, businessId, itemData) {
    // Validate that collection belongs to business
    const collection = await database.query('collections')
      .where({ id: collectionId, business_id: businessId })
      .first();
    
    if (!collection) {
      throw new Error('Collection not found or does not belong to this business');
    }

    // Validate that either product_id or other_id is provided, but not both
    if (!itemData.product_id && !itemData.other_id) {
      throw new Error('Either product_id or other_id must be provided');
    }
    
    if (itemData.product_id && itemData.other_id) {
      throw new Error('Cannot provide both product_id and other_id');
    }

    // If adding a product, validate it belongs to the business
    if (itemData.product_id) {
      const product = await database.query('products')
        .where({ id: itemData.product_id, business_id: businessId })
        .first();
      
      if (!product) {
        throw new Error('Product not found or does not belong to this business');
      }
    }

    // If adding an other item, validate it belongs to the business
    if (itemData.other_id) {
      const other = await database.query('others')
        .where({ id: itemData.other_id, business_id: businessId })
        .first();
      
      if (!other) {
        throw new Error('Other item not found or does not belong to this business');
      }
    }

    // Use collection price as override, or null if no override needed
    const priceOverride = collection.price || null;

    return database.query('collection_items').insert({
      collection_id: collectionId,
      product_id: itemData.product_id || null,
      other_id: itemData.other_id || null,
      price_override: priceOverride
    }).returning('*');
  }

  async removeItemFromCollection(collectionId, itemId) {
    return database.query('collection_items')
      .where({ collection_id: collectionId, id: itemId })
      .del();
  }

  // Combined inventory search
  async searchInventory(businessId, searchTerm, filter = 'all') {
    // For now, let's use a simpler approach that works with the database wrapper
    const [products, others, collections] = await Promise.all([
      database.query('products')
        .where('business_id', businessId)
        .whereRaw('name ILIKE ?', [`%${searchTerm}%`])
        .select('*')
        .then(rows => rows.map(row => ({ ...row, type: 'product' }))),
      database.query('others')
        .where('business_id', businessId)
        .whereRaw('name ILIKE ?', [`%${searchTerm}%`])
        .select('*')
        .then(rows => rows.map(row => ({ ...row, type: 'other' }))),
      database.query('collections')
        .where('business_id', businessId)
        .whereRaw('name ILIKE ?', [`%${searchTerm}%`])
        .select('*')
        .then(rows => rows.map(row => ({ ...row, type: 'collection' })))
    ]);

    // Get collection information for products and others
    const productsWithCollections = await Promise.all(
      products.map(async (product) => {
        const collectionItems = await database.query('collection_items as ci')
          .select('ci.price_override', 'c.name as collection_name', 'c.price as collection_price')
          .leftJoin('collections as c', 'ci.collection_id', 'c.id')
          .where('ci.product_id', product.id)
          .first();
        
        return {
          ...product,
          price_override: collectionItems?.price_override || null,
          collection_name: collectionItems?.collection_name || null,
          collection_price: collectionItems?.collection_price || null
        };
      })
    );

    const othersWithCollections = await Promise.all(
      others.map(async (other) => {
        const collectionItems = await database.query('collection_items as ci')
          .select('ci.price_override', 'c.name as collection_name', 'c.price as collection_price')
          .leftJoin('collections as c', 'ci.collection_id', 'c.id')
          .where('ci.other_id', other.id)
          .first();
        
        return {
          ...other,
          price_override: collectionItems?.price_override || null,
          collection_name: collectionItems?.collection_name || null,
          collection_price: collectionItems?.collection_price || null
        };
      })
    );

    let results = [...productsWithCollections, ...othersWithCollections, ...collections].sort((a, b) => a.name.localeCompare(b.name));

    // Apply filter if specified
    if (filter !== 'all') {
      results = results.filter(item => item.type === filter);
    }

    return results;
  }

  // Get inventory summary
  async getInventorySummary(businessId) {
    const [products, others, collections] = await Promise.all([
      database.query('products').where('business_id', businessId).count('* as count'),
      database.query('others').where('business_id', businessId).count('* as count'),
      database.query('collections').where('business_id', businessId).count('* as count')
    ]);

    return {
      products: products[0].count,
      others: others[0].count,
      collections: collections[0].count,
      total: parseInt(products[0].count) + parseInt(others[0].count) + parseInt(collections[0].count)
    };
  }

  // Get out of stock products
  async getOutOfStockProducts(businessId) {
    return database.query('products')
      .where('business_id', businessId)
      .where('stock_count', '<=', 0)
      .orderBy('name');
  }
}

module.exports = new InventoryService(); 