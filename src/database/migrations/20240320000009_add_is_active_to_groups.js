exports.up = function(knex) {
  return knex.schema.table('groups', function(table) {
    table.boolean('is_active').defaultTo(true);
  });
};
 
exports.down = function(knex) {
  return knex.schema.table('groups', function(table) {
    table.dropColumn('is_active');
  });
}; 