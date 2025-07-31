exports.up = function(knex) {
  return knex.schema.table('bot_metrics', function(table) {
    table.string('platform').defaultTo('whatsapp');
  });
};

exports.down = function(knex) {
  return knex.schema.table('bot_metrics', function(table) {
    table.dropColumn('platform');
  });
}; 