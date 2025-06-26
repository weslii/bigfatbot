exports.up = function(knex) {
  return knex.schema.table('orders', function(table) {
    table.string('updated_by').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.table('orders', function(table) {
    table.dropColumn('updated_by');
  });
}; 