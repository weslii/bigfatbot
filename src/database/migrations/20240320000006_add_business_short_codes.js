exports.up = function(knex) {
  return knex.schema.alterTable('groups', function(table) {
    // Add short_code column for business setup
    table.string('short_code', 10).unique();
    // Add setup_identifier column (businessname-CODE)
    table.string('setup_identifier', 100).unique();
    // Add index for fast lookup
    table.index('short_code');
    table.index('setup_identifier');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('groups', function(table) {
    table.dropColumn('short_code');
    table.dropColumn('setup_identifier');
  });
}; 