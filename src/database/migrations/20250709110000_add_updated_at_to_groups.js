exports.up = function(knex) {
  return knex.schema.table('groups', function(table) {
    table.timestamp('updated_at');
  });
};

exports.down = function(knex) {
  return knex.schema.table('groups', function(table) {
    table.dropColumn('updated_at');
  });
}; 