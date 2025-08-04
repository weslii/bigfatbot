exports.up = function(knex) {
  return knex.schema.createTable('matching_learning_data', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('business_id').notNullable();
    table.text('original_text').notNullable();
    table.uuid('matched_item_id');
    table.string('matched_item_type', 10); // 'product' or 'other'
    table.boolean('user_confirmed');
    table.decimal('confidence_score', 3, 2);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Add indexes for better query performance
    table.index('business_id');
    table.index('created_at');
    table.index(['business_id', 'user_confirmed']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('matching_learning_data');
}; 