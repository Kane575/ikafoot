import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error(
    'DATABASE_URL est absent. Copiez .env.example vers .env puis renseignez votre chaîne de connexion PostgreSQL.'
  );
  process.exit(1);
}

// Les bases managées (Neon, Supabase, Render) imposent TLS avec un certificat
// que Node ne connaît pas ; en local on se connecte en clair.
const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (error) => {
  console.error('Erreur inattendue sur le pool PostgreSQL :', error.message);
});

export function query(text, params) {
  return pool.query(text, params);
}

/** Exécute une suite de requêtes dans une transaction. */
export async function transaction(run) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
