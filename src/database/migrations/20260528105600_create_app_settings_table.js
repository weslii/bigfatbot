exports.up = async function up(knex) {
  await knex.schema.createTable('app_settings', (table) => {
    table.string('key').primary();
    table.jsonb('value').notNullable();
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex('app_settings').insert([
    {
      key: 'continuous_notifications_enabled',
      value: { enabled: true },
      updated_at: knex.fn.now()
    }
  ]);
};

exports.down = async function down(knex) {
  await knex.schema.dropTable('app_settings');
};

