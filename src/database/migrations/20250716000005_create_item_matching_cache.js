exports.up = function(knex) {
  return knex.schema.createTable('item_matching_cache', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('business_id').notNullable();
    table.text('original_text_hash').notNullable();
    table.uuid('matched_item_id');
    table.string('matched_item_type', 10);
    table.decimal('confidence_score', 3, 2);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('expires_at').defaultTo(knex.raw('NOW() + INTERVAL \'1 hour\''));
    
    // Add indexes for better query performance
    table.index('business_id');
    table.index('original_text_hash');
    table.index('expires_at');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('item_matching_cache');
}; 