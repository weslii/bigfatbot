exports.up = function(knex) {
  return knex.schema.createTable('groups', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users');
    table.uuid('business_id').notNullable();
    table.string('business_name', 255).notNullable();
    table.string('group_name', 255).notNullable();
    table.string('group_id', 255).notNullable();
    table.string('group_type', 50).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Add unique constraint for business_id and group_type
    table.unique(['business_id', 'group_type']);
    
    // Add index for better query performance
    table.index('business_id');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('groups');
}; 