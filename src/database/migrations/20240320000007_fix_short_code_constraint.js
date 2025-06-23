exports.up = function(knex) {
  // This migration is no longer needed - we're keeping global unique constraints
  // and only storing short codes in the first group (sales group)
  return Promise.resolve();
};

exports.down = function(knex) {
  // This migration is no longer needed
  return Promise.resolve();
}; 