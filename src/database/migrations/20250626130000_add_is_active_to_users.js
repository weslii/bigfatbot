exports.up = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.boolean('is_active').defaultTo(true).notNullable();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.dropColumn('is_active');
  });
}; 