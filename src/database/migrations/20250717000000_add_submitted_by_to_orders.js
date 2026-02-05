exports.up = function(knex) {
  return knex.schema.alterTable('orders', function(table) {
    table.string('submitted_by', 255).nullable().defaultTo(null);
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('orders', function(table) {
    table.dropColumn('submitted_by');
  });
};
