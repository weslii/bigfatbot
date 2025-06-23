exports.up = function(knex) {
  return knex.schema.createTable('bot_metrics', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.integer('total_messages').defaultTo(0);
    table.integer('successful_messages').defaultTo(0);
    table.integer('failed_messages').defaultTo(0);
    table.jsonb('response_times').defaultTo('[]'); // Array of response times in ms
    table.jsonb('daily_counts').defaultTo('{}'); // Object with date keys and counts
    table.timestamp('last_activity').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('bot_metrics');
}; 