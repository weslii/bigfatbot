exports.up = function(knex) {
  return knex.schema.createTable('admins', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('username').notNullable().unique();
    table.string('email').notNullable().unique();
    table.string('password_hash').notNullable();
    table.string('role').notNullable().defaultTo('admin'); // admin, super_admin
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('last_login');
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('admins');
}; 