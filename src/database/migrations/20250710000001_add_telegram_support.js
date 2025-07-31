exports.up = function(knex) {
  return knex.schema.table('bot_connection_status', function(table) {
    table.string('telegram_status').defaultTo('disconnected');
    table.string('telegram_bot_username');
    table.timestamp('telegram_last_activity');
  });
};

exports.down = function(knex) {
  return knex.schema.table('bot_connection_status', function(table) {
    table.dropColumn('telegram_status');
    table.dropColumn('telegram_bot_username');
    table.dropColumn('telegram_last_activity');
  });
}; 