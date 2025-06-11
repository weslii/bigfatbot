const bcrypt = require('bcrypt');

exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('admins').del();

  // Inserts seed entries
  const passwordHash = await bcrypt.hash('admin123', 10);
  
  return knex('admins').insert([
    {
      username: 'admin',
      email: 'admin@example.com',
      password_hash: passwordHash,
      role: 'super_admin',
      is_active: true
    }
  ]);
}; 