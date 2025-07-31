exports.seed = function(knex) {
  // First, get a business_id from existing groups
  return knex('groups').first('business_id')
    .then(group => {
      if (!group) {
        console.log('No business found, skipping inventory seed');
        return;
      }
      
      const businessId = group.business_id;
      
      // Sample products (reducible items)
      const products = [
        {
          business_id: businessId,
          name: 'Coffee Beans',
          description: 'Premium Arabica coffee beans',
          price: 15.99,
          stock_count: 50,
          image_url: '/images/coffee-beans.jpg'
        },
        {
          business_id: businessId,
          name: 'Milk',
          description: 'Fresh whole milk',
          price: 3.49,
          stock_count: 30,
          image_url: '/images/milk.jpg'
        },
        {
          business_id: businessId,
          name: 'Sugar',
          description: 'White granulated sugar',
          price: 2.99,
          stock_count: 25,
          image_url: '/images/sugar.jpg'
        },
        {
          business_id: businessId,
          name: 'Coffee Cups',
          description: 'Disposable coffee cups',
          price: 0.50,
          stock_count: 200,
          image_url: '/images/cups.jpg'
        },
        {
          business_id: businessId,
          name: 'Coffee Filters',
          description: 'Paper coffee filters',
          price: 4.99,
          stock_count: 100,
          image_url: '/images/filters.jpg'
        }
      ];

      // Sample others (non-reducible items)
      const others = [
        {
          business_id: businessId,
          name: 'Delivery Fee',
          description: 'Standard delivery charge',
          price: 5.00,
          image_url: '/images/delivery.jpg'
        },
        {
          business_id: businessId,
          name: 'Service Charge',
          description: 'Service and handling fee',
          price: 2.50,
          image_url: '/images/service.jpg'
        },
        {
          business_id: businessId,
          name: 'Tax',
          description: 'Sales tax',
          price: 1.25,
          image_url: '/images/tax.jpg'
        }
      ];

      // Sample collections
      const collections = [
        {
          business_id: businessId,
          name: 'Local Delivery',
          description: 'Delivery within city limits',
          price: 8.00,
          image_url: '/images/local-delivery.jpg',
          type: 'other'
        },
        {
          business_id: businessId,
          name: 'Regional Delivery',
          description: 'Delivery to nearby cities',
          price: 12.00,
          image_url: '/images/regional-delivery.jpg',
          type: 'other'
        },
        {
          business_id: businessId,
          name: 'Coffee Starter Pack',
          description: 'Everything you need to start brewing coffee',
          price: 25.00,
          image_url: '/images/coffee-starter.jpg',
          type: 'product'
        }
      ];

      return knex('products').insert(products)
        .then(() => knex('others').insert(others))
        .then(() => knex('collections').insert(collections))
        .then(() => {
          // Get the inserted collections to add items to them
          return knex('collections').where('business_id', businessId);
        })
        .then(insertedCollections => {
          const localDelivery = insertedCollections.find(c => c.name === 'Local Delivery');
          const regionalDelivery = insertedCollections.find(c => c.name === 'Regional Delivery');
          const coffeeStarter = insertedCollections.find(c => c.name === 'Coffee Starter Pack');
          
          // Get the inserted products and others
          return Promise.all([
            knex('products').where('business_id', businessId),
            knex('others').where('business_id', businessId)
          ]).then(([products, others]) => {
            const deliveryFee = others.find(o => o.name === 'Delivery Fee');
            const serviceCharge = others.find(o => o.name === 'Service Charge');
            const coffeeBeans = products.find(p => p.name === 'Coffee Beans');
            const coffeeFilters = products.find(p => p.name === 'Coffee Filters');
            
            // Add items to collections
            const collectionItems = [
              {
                collection_id: localDelivery.id,
                other_id: deliveryFee.id
              },
              {
                collection_id: localDelivery.id,
                other_id: serviceCharge.id
              },
              {
                collection_id: regionalDelivery.id,
                other_id: deliveryFee.id
              },
              {
                collection_id: regionalDelivery.id,
                other_id: serviceCharge.id
              },
              {
                collection_id: coffeeStarter.id,
                product_id: coffeeBeans.id
              },
              {
                collection_id: coffeeStarter.id,
                product_id: coffeeFilters.id
              }
            ];
            
            return knex('collection_items').insert(collectionItems);
          });
        });
    });
}; 