exports.up = function(knex) {
  return knex.schema.alterTable('orders', function(table) {
    table.decimal('total_revenue', 10, 2).defaultTo(0.00);
    table.jsonb('matched_items');
    table.decimal('matching_confidence', 3, 2).defaultTo(0.00);
    table.string('matching_status', 20).defaultTo('pending');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('orders', function(table) {
    table.dropColumn('total_revenue');
    table.dropColumn('matched_items');
    table.dropColumn('matching_confidence');
    table.dropColumn('matching_status');
  });
}; 