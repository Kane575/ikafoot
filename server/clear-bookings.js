import 'dotenv/config';
import { pool } from './db.js';

/**
 * Efface les réservations, et rien d'autre : les créneaux types, les tarifs et
 * le compte propriétaire sont conservés. Sert à repartir d'une base propre
 * après une séance d'essai, sans avoir à tout recréer.
 *
 *   npm run db:bookings:clear -- --yes          toutes les réservations
 *   npm run db:bookings:clear -- --yes --phone 76001122   celles d'un numéro
 */

const args = process.argv.slice(2);
const confirme = args.includes('--yes');
const indexPhone = args.indexOf('--phone');
const phone = indexPhone >= 0 ? args[indexPhone + 1] : null;

async function main() {
  const cible = phone ? 'du numéro ' + phone : 'TOUTES les réservations';

  const compte = await pool.query(
    phone
      ? 'SELECT count(*) FROM bookings WHERE phone = $1'
      : 'SELECT count(*) FROM bookings',
    phone ? [phone] : []
  );
  const total = Number(compte.rows[0].count);

  if (total === 0) {
    console.log('Rien à effacer.');
    return;
  }

  // Sans --yes, on montre ce qui serait supprimé sans rien toucher : la base
  // pointée peut être celle de production.
  if (!confirme) {
    console.log(
      `${total} réservation(s) ${cible} seraient effacées.\n` +
        'Relancez avec --yes pour confirmer. Vérifiez d’abord DATABASE_URL :\n' +
        '  ' + String(process.env.DATABASE_URL).replace(/:[^:@]*@/, ':****@')
    );
    process.exitCode = 1;
    return;
  }

  const result = await pool.query(
    phone ? 'DELETE FROM bookings WHERE phone = $1' : 'DELETE FROM bookings',
    phone ? [phone] : []
  );

  console.log(`${result.rowCount} réservation(s) effacée(s). Créneaux et compte propriétaire intacts.`);
}

main()
  .catch((error) => {
    console.error('Échec :', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
