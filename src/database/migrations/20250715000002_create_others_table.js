exports.up = function(knex) {
  return knex.schema.createTable('others', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('business_id').notNullable();
    table.string('name', 255).notNullable();
    table.text('description');
    table.decimal('price', 10, 2).notNullable();
    table.string('image_url');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Add index for better query performance
    table.index('business_id');
    table.index(['business_id', 'name']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('others');
}; 