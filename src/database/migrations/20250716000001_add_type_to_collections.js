exports.up = function(knex) {
  return knex.schema.alterTable('collections', function(table) {
    table.enum('type', ['product', 'other']).notNullable().defaultTo('product');
    table.index(['business_id', 'type']);
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('collections', function(table) {
    table.dropIndex(['business_id', 'type']);
    table.dropColumn('type');
  });
}; 