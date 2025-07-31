exports.up = function(knex) {
  return knex.schema.table('orders', function(table) {
    table.string('source').defaultTo('whatsapp');
  });
};

exports.down = function(knex) {
  return knex.schema.table('orders', function(table) {
    table.dropColumn('source');
  });
}; 