exports.up = function(knex) {
  return knex.schema.alterTable('groups', function(table) {
    // Add platform column to distinguish between WhatsApp and Telegram
    table.string('platform', 20).defaultTo('whatsapp');
    
    // Add Telegram-specific columns
    table.string('telegram_chat_id', 255);
    table.string('telegram_bot_token', 255);
    
    // Update unique constraint to include platform
    // First drop the existing unique constraint
    table.dropUnique(['business_id', 'group_type']);
    
    // Add new unique constraint that includes platform
    table.unique(['business_id', 'platform', 'group_type']);
    
    // Add indexes for better performance
    table.index('platform');
    table.index('telegram_chat_id');
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('groups', function(table) {
    // Drop the new unique constraint
    table.dropUnique(['business_id', 'platform', 'group_type']);
    
    // Restore the original unique constraint
    table.unique(['business_id', 'group_type']);
    
    // Drop indexes
    table.dropIndex('platform');
    table.dropIndex('telegram_chat_id');
    
    // Drop Telegram-specific columns
    table.dropColumn('telegram_chat_id');
    table.dropColumn('telegram_bot_token');
    
    // Drop platform column
    table.dropColumn('platform');
  });
}; 