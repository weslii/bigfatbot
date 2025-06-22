exports.up = function(knex) {
  return knex.schema.createTable('orders', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('order_id', 50).notNullable().unique();
    table.uuid('business_id').notNullable();
    table.string('customer_name', 255).notNullable();
    table.string('customer_phone', 20).notNullable();
    table.text('address').notNullable();
    table.text('items').notNullable();
    table.date('delivery_date');
    table.string('status', 50).notNullable().defaultTo('pending');
    table.string('delivery_person', 255);
    table.string('updated_by', 255);
    table.text('notes');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Add indexes for better query performance
    table.index('business_id');
    table.index('status');
    table.index('delivery_date');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('orders');
}; 