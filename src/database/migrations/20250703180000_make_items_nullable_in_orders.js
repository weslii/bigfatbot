exports.up = function(knex) {
  return knex.schema.alterTable('orders', function(table) {
    table.text('items').nullable().alter();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('orders', function(table) {
    table.text('items').notNullable().alter();
  });
}; 