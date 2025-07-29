exports.up = function(knex) {
  return knex.schema.alterTable('orders', function(table) {
    // Add source column for platform tracking
    table.string('source', 20).defaultTo('whatsapp');
    
    // Add index for better query performance
    table.index('source');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('orders', function(table) {
    table.dropColumn('source');
  });
}; 