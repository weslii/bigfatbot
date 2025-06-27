exports.up = function(knex) {
  return knex.schema.alterTable('bot_metrics', function(table) {
    table.jsonb('response_times').alter();
  });
};
 
exports.down = function(knex) {
  return knex.schema.alterTable('bot_metrics', function(table) {
    table.text('response_times').alter();
  });
}; 