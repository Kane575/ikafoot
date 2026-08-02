import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shouldReset = process.argv.includes('--reset');

async function main() {
  if (shouldReset) {
    console.log('Suppression des tables existantes…');
    await pool.query('DROP TABLE IF EXISTS bookings, slot_templates, admins CASCADE');
  }

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);

  console.log('Schéma appliqué.');
}

main()
  .catch((error) => {
    console.error('Migration échouée :', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
