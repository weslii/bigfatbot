exports.up = function(knex) {
  return knex.schema.alterTable('collection_items', function(table) {
    table.decimal('price_override', 10, 2).nullable();
    table.index('price_override');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('collection_items', function(table) {
    table.dropIndex('price_override');
    table.dropColumn('price_override');
  });
}; 