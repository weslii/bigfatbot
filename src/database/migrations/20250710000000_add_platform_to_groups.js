exports.up = function(knex) {
  return knex.schema.table('groups', function(table) {
    table.string('platform').defaultTo('whatsapp').notNullable();
  });
};

exports.down = function(knex) {
  return knex.schema.table('groups', function(table) {
    table.dropColumn('platform');
  });
}; 