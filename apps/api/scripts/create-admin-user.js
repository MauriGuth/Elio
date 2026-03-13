require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const id = 'c' + crypto.randomBytes(12).toString('hex');
const email = 'admin@elio.com';
const password = 'admin123';
const firstName = 'Admin';
const lastName = 'Nova';
const role = 'ADMIN';

async function main() {
  const hash = await bcrypt.hash(password, 10);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, true, now(), now())`,
    [id, email, hash, firstName, lastName, role]
  );
  await client.end();
  console.log('Usuario admin creado.');
  console.log('Email:', email);
  console.log('Contraseña:', password);
}

main().catch((e) => { console.error(e); process.exit(1); });
