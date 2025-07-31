exports.up = function(knex) {
  return knex.schema.createTable('collection_items', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('collection_id').notNullable().references('id').inTable('collections').onDelete('CASCADE');
    table.uuid('product_id').references('id').inTable('products').onDelete('CASCADE');
    table.uuid('other_id').references('id').inTable('others').onDelete('CASCADE');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Ensure either product_id or other_id is set, but not both
    table.check('(product_id IS NOT NULL AND other_id IS NULL) OR (product_id IS NULL AND other_id IS NOT NULL)');
    
    // Add indexes for better query performance
    table.index('collection_id');
    table.index('product_id');
    table.index('other_id');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('collection_items');
}; 