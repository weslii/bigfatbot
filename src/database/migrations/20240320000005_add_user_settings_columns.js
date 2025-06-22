exports.up = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    // Add missing columns for settings
    table.string('phone', 20); // Rename phone_number to phone for consistency
    table.string('timezone', 50).defaultTo('UTC');
    table.text('address');
    table.string('password', 255); // For password change functionality
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('last_login');
    
    // Notification preferences
    table.boolean('email_new_orders').defaultTo(true);
    table.boolean('email_daily_reports').defaultTo(false);
    table.boolean('email_weekly_reports').defaultTo(false);
    table.boolean('whatsapp_new_orders').defaultTo(true);
    table.boolean('whatsapp_reminders').defaultTo(true);
    table.boolean('dashboard_alerts').defaultTo(true);
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.dropColumn('phone');
    table.dropColumn('timezone');
    table.dropColumn('address');
    table.dropColumn('password');
    table.dropColumn('updated_at');
    table.dropColumn('last_login');
    table.dropColumn('email_new_orders');
    table.dropColumn('email_daily_reports');
    table.dropColumn('email_weekly_reports');
    table.dropColumn('whatsapp_new_orders');
    table.dropColumn('whatsapp_reminders');
    table.dropColumn('dashboard_alerts');
  });
}; 