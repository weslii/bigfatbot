exports.up = function(knex) {
  return knex.schema.alterTable('bot_metrics', function(table) {
    table.integer('parsing_attempts').defaultTo(0);
    table.integer('parsing_successes').defaultTo(0);
    table.integer('parsing_failures').defaultTo(0);
    table.integer('filtered_messages').defaultTo(0);
    table.integer('ai_parsed_orders').defaultTo(0);
    table.integer('pattern_parsed_orders').defaultTo(0);
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('bot_metrics', function(table) {
    table.dropColumn('parsing_attempts');
    table.dropColumn('parsing_successes');
    table.dropColumn('parsing_failures');
    table.dropColumn('filtered_messages');
    table.dropColumn('ai_parsed_orders');
    table.dropColumn('pattern_parsed_orders');
  });
}; 