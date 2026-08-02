import { Router } from 'express';
import { query } from '../db.js';
import { route } from '../lib/async-handler.js';
import {
  DEPOSIT_RATIO,
  HOLD_HOURS,
  HORIZON_DAYS,
  PAYMENT_PHONE,
  depositFor,
  formatTime,
  holdExpiresAt,
  isDateInHorizon,
  isSlotPast,
  isWeekend,
  parseISODate,
  priceFor,
  weekdayIndex,
} from '../lib/schedule.js';
import { buildSchedule, findBookableSlot, releaseExpiredHolds } from '../lib/slots-service.js';
import {
  HttpError,
  generateReference,
  requireInt,
  requirePhone,
  requirePlayers,
  requireText,
} from '../lib/validate.js';

const router = Router();

const BOOKING_COLUMNS = `
  b.id,
  b.reference,
  b.customer_name,
  b.phone,
  b.players,
  b.price,
  b.deposit,
  b.status,
  b.hold_expires_at,
  to_char(b.booking_date, 'YYYY-MM-DD') AS date,
  to_char(t.start_time, 'HH24:MI')      AS start,
  to_char(t.end_time,   'HH24:MI')      AS "end",
  b.created_at
`;

function serializeBooking(row) {
  return {
    id: row.id,
    reference: row.reference,
    customerName: row.customer_name,
    phone: row.phone,
    players: row.players,
    price: row.price,
    deposit: row.deposit,
    status: row.status,
    holdExpiresAt: row.hold_expires_at ?? null,
    date: row.date,
    start: row.start,
    end: row.end,
    createdAt: row.created_at,
  };
}

/** Les règles de paiement, affichées au client avant qu'il ne réserve. */
const paymentTerms = {
  depositPercent: Math.round(DEPOSIT_RATIO * 100),
  holdHours: HOLD_HOURS,
  phone: PAYMENT_PHONE,
};

/** Planning des 7 prochains jours, avec disponibilité et prix du jour. */
router.get('/slots', route(async (req, res) => {
  const days = await buildSchedule(HORIZON_DAYS);

  res.json({
    horizonDays: HORIZON_DAYS,
    payment: paymentTerms,
    days,
    availableCount: days.reduce((total, day) => total + day.availableCount, 0),
  });
}));

/** Création d'une réservation : elle reste en attente jusqu'au versement de l'acompte. */
router.post('/bookings', route(async (req, res) => {
  const templateId = requireInt(req.body?.templateId, 'Le créneau', { min: 1 });
  const date = String(req.body?.date ?? '').trim();
  const customerName = requireText(req.body?.customerName, 'Le nom complet');
  const phone = requirePhone(req.body?.phone);
  const players = requirePlayers(req.body?.players);

  if (!parseISODate(date)) {
    throw new HttpError(400, 'Date invalide.');
  }
  if (!isDateInHorizon(date)) {
    throw new HttpError(400, `Vous ne pouvez réserver que sur les ${HORIZON_DAYS} prochains jours.`);
  }

  // Une option périmée sur ce créneau doit tomber avant qu'on teste sa disponibilité.
  await releaseExpiredHolds();

  const template = await findBookableSlot(templateId, date);
  if (!template) {
    throw new HttpError(404, "Ce créneau n'existe pas ce jour-là.");
  }
  if (isSlotPast(date, template.start_time)) {
    throw new HttpError(409, 'Ce créneau est déjà passé.');
  }

  const weekend = isWeekend(weekdayIndex(parseISODate(date)));
  const price = priceFor(template, weekend);
  const deposit = depositFor(price);
  const expiresAt = holdExpiresAt(date, template.start_time);

  try {
    const result = await query(
      `INSERT INTO bookings
         (reference, template_id, booking_date, customer_name, phone, players, price, deposit, status, hold_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
       RETURNING id, reference, customer_name, phone, players, price, deposit, status, hold_expires_at,
                 to_char(booking_date, 'YYYY-MM-DD') AS date, created_at`,
      [generateReference(), template.id, date, customerName, phone, players, price, deposit, expiresAt]
    );

    const booking = serializeBooking({
      ...result.rows[0],
      start: formatTime(template.start_time),
      end: formatTime(template.end_time),
    });

    res.status(201).json({
      message: `Créneau réservé. Versez ${deposit} FCFA d’acompte pour le confirmer.`,
      payment: paymentTerms,
      booking,
    });
  } catch (error) {
    // 23505 = violation d'unicité : quelqu'un a réservé ce créneau entre-temps.
    if (error.code === '23505') {
      throw new HttpError(409, 'Ce créneau vient d’être réservé par quelqu’un d’autre.');
    }
    throw error;
  }
}));

/** « Mes réservations » : recherche par numéro de téléphone. */
router.get('/bookings/lookup', route(async (req, res) => {
  const phone = requirePhone(req.query?.phone);
  await releaseExpiredHolds();

  const result = await query(
    `SELECT ${BOOKING_COLUMNS}
       FROM bookings b
       JOIN slot_templates t ON t.id = b.template_id
      WHERE b.phone = $1
        AND b.booking_date >= CURRENT_DATE - INTERVAL '1 day'
      ORDER BY b.booking_date, t.start_time`,
    [phone]
  );

  res.json({ bookings: result.rows.map(serializeBooking) });
}));

/** Annulation par le client : il doit fournir sa référence ET son numéro. */
router.post('/bookings/:reference/cancel', route(async (req, res) => {
  const reference = String(req.params.reference ?? '').trim().toUpperCase();
  const phone = requirePhone(req.body?.phone);

  const result = await query(
    `UPDATE bookings
        SET status = 'cancelled', cancelled_at = now(), hold_expires_at = NULL
      WHERE reference = $1
        AND phone = $2
        AND status IN ('pending', 'confirmed')
      RETURNING id`,
    [reference, phone]
  );

  if (result.rowCount === 0) {
    throw new HttpError(404, 'Aucune réservation active ne correspond à cette référence et ce numéro.');
  }

  res.json({ message: 'Réservation annulée.' });
}));

export default router;
