exports.up = function(knex) {
  return knex.schema.createTable('matching_analytics', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('business_id').notNullable();
    table.integer('total_items');
    table.integer('auto_matched');
    table.integer('ai_matched');
    table.integer('human_confirmed');
    table.decimal('total_revenue', 10, 2);
    table.decimal('average_confidence', 3, 2);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Add indexes for better query performance
    table.index('business_id');
    table.index('created_at');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('matching_analytics');
}; 