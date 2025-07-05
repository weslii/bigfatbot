exports.up = function(knex) {
  return knex.schema.alterTable('orders', function(table) {
    table.string('customer_phone', 100).notNullable().alter();
  });
};
 
exports.down = function(knex) {
  return knex.schema.alterTable('orders', function(table) {
    table.string('customer_phone', 20).notNullable().alter();
  });
}; 