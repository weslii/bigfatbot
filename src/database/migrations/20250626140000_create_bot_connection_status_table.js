/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('bot_connection_status', (table) => {
    table.increments('id').primary();
    table.string('status').notNullable().defaultTo('unknown');
    table.string('phone_number').nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Ensure only one record exists
    table.unique(['id']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('bot_connection_status');
}; 