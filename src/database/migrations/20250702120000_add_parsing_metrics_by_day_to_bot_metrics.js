exports.up = function(knex) {
  return knex.schema.alterTable('bot_metrics', function(table) {
    table.jsonb('parsing_metrics_by_day').defaultTo('{}');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('bot_metrics', function(table) {
    table.dropColumn('parsing_metrics_by_day');
  });
}; 