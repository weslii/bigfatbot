exports.up = function(knex) {
  return knex.schema.createTable('bot_control', function(table) {
    table.increments('id').primary();
    table.boolean('restart_requested').defaultTo(false);
    table.timestamp('last_restart').nullable();
  }).then(() =>
    knex('bot_control').insert({ restart_requested: false })
  );
};

exports.down = function(knex) {
  return knex.schema.dropTable('bot_control');
}; 