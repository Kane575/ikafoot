import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { normalizePhone } from './lib/auth.js';
import { DAY_NAMES } from './lib/schedule.js';

// Le terrain ouvre 20 h par jour, tous les jours : 06:00 → 02:00 du matin,
// en créneaux d'une heure. Les deux créneaux d'après minuit (00:00 et 01:00)
// appartiennent au jour civil où ils commencent — ils apparaissent donc en tête
// de journée dans le planning, pas à la fin de la veille.
const OPENING_HOURS = [
  ...Array.from({ length: 18 }, (_, index) => index + 6), // 06 → 23
  0,
  1,
];

const pad = (hour) => String(hour).padStart(2, '0');

// weekday : 0 = lundi ... 6 = dimanche.
const defaultTemplates = Array.from({ length: 7 }, (_, weekday) =>
  OPENING_HOURS.map((hour) => ({
    weekday,
    start: `${pad(hour)}:00`,
    end: `${pad((hour + 1) % 24)}:00`,
  }))
).flat();

async function main() {
  const phone = normalizePhone(process.env.ADMIN_PHONE || '76958877');
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Propriétaire IKAFOOT';

  if (!password || password.length < 8) {
    console.error(
      'ADMIN_PASSWORD est absent ou trop court (8 caractères minimum).\n' +
        'Renseignez-le dans .env avant de lancer le seed.'
    );
    process.exitCode = 1;
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Ré-exécutable : met à jour le mot de passe si le compte existe déjà.
  await pool.query(
    `INSERT INTO admins (phone, password_hash, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (phone) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           name = EXCLUDED.name`,
    [phone, passwordHash, name]
  );
  console.log(`Compte admin prêt — téléphone : ${phone}`);

  const weekdayPrice = Number(process.env.DEFAULT_WEEKDAY_PRICE) || 25000;
  const weekendPrice = Number(process.env.DEFAULT_WEEKEND_PRICE) || 30000;

  // Ré-exécutable : un créneau déjà présent voit son horaire de fin et ses tarifs
  // réalignés sur la grille, et il est réactivé. Le format de match, lui, reste
  // celui que le propriétaire a choisi.
  for (const template of defaultTemplates) {
    await pool.query(
      `INSERT INTO slot_templates (weekday, start_time, end_time, players, weekday_price, weekend_price)
       VALUES ($1, $2, $3, '5 vs 5', $4, $5)
       ON CONFLICT (weekday, start_time) DO UPDATE
         SET end_time      = EXCLUDED.end_time,
             weekday_price = EXCLUDED.weekday_price,
             weekend_price = EXCLUDED.weekend_price,
             active        = TRUE`,
      [template.weekday, template.start, template.end, weekdayPrice, weekendPrice]
    );
  }

  console.log(
    `${defaultTemplates.length} créneaux types en place ` +
      `(${OPENING_HOURS.length} par jour, ${DAY_NAMES[0].toLowerCase()} → ${DAY_NAMES[6].toLowerCase()}) — ` +
      `${weekdayPrice} FCFA en semaine, ${weekendPrice} le week-end.`
  );
}

main()
  .catch((error) => {
    console.error('Seed échoué :', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
