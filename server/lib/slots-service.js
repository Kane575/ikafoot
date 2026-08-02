import { query } from '../db.js';
import {
  HORIZON_DAYS,
  depositFor,
  formatTime,
  isSlotPast,
  priceFor,
  rollingDays,
} from './schedule.js';

/**
 * Rend les créneaux dont l'acompte n'est jamais arrivé. Appelé avant chaque
 * lecture du planning et avant chaque réservation : pas de tâche planifiée à
 * maintenir, et une option périmée ne bloque jamais un créneau plus longtemps
 * que la première visite qui suit son expiration.
 */
export async function releaseExpiredHolds() {
  const result = await query(
    `UPDATE bookings
        SET status = 'expired'
      WHERE status = 'pending'
        AND hold_expires_at IS NOT NULL
        AND hold_expires_at <= now()`
  );
  return result.rowCount;
}

/**
 * Assemble le planning affiché au client : les créneaux types de chaque jour,
 * croisés avec les réservations vivantes sur la fenêtre glissante.
 */
export async function buildSchedule(days = HORIZON_DAYS) {
  await releaseExpiredHolds();

  const calendar = rollingDays(days);
  const firstDate = calendar[0].date;
  const lastDate = calendar[calendar.length - 1].date;

  const [templatesResult, bookingsResult] = await Promise.all([
    query(
      `SELECT id, weekday, start_time, end_time, players, weekday_price, weekend_price
         FROM slot_templates
        WHERE active = TRUE
        ORDER BY weekday, start_time`
    ),
    query(
      `SELECT template_id, status, to_char(booking_date, 'YYYY-MM-DD') AS booking_date
         FROM bookings
        WHERE status IN ('pending', 'confirmed')
          AND booking_date BETWEEN $1 AND $2`,
      [firstDate, lastDate]
    ),
  ]);

  const templatesByWeekday = new Map();
  for (const template of templatesResult.rows) {
    const list = templatesByWeekday.get(template.weekday) ?? [];
    list.push(template);
    templatesByWeekday.set(template.weekday, list);
  }

  // Un créneau pris l'est soit fermement, soit le temps d'un acompte à verser :
  // le client voit la différence, mais dans les deux cas il ne peut pas réserver.
  const takenKeys = new Map(
    bookingsResult.rows.map((row) => [`${row.template_id}|${row.booking_date}`, row.status])
  );

  const now = new Date();

  return calendar.map((day) => {
    const templates = templatesByWeekday.get(day.weekday) ?? [];

    const slots = templates.map((template) => {
      const takenBy = takenKeys.get(`${template.id}|${day.date}`) ?? null;
      const past = day.isToday && isSlotPast(day.date, template.start_time, now);
      const price = priceFor(template, day.isWeekend);

      return {
        templateId: template.id,
        date: day.date,
        start: formatTime(template.start_time),
        end: formatTime(template.end_time),
        players: template.players,
        price,
        deposit: depositFor(price),
        booked: takenBy === 'confirmed',
        held: takenBy === 'pending',
        past,
        available: takenBy === null && !past,
      };
    });

    return {
      ...day,
      slots,
      availableCount: slots.filter((slot) => slot.available).length,
    };
  });
}

/**
 * Récupère un créneau précis et son prix réel pour une date donnée.
 * Le prix est toujours recalculé côté serveur : le client ne peut pas l'imposer.
 */
export async function findBookableSlot(templateId, isoDate) {
  const result = await query(
    `SELECT t.id, t.start_time, t.end_time, t.players, t.weekday_price, t.weekend_price
       FROM slot_templates t
      WHERE t.id = $1
        AND t.active = TRUE
        AND t.weekday = (EXTRACT(ISODOW FROM $2::date)::int - 1)`,
    [templateId, isoDate]
  );

  return result.rows[0] ?? null;
}
