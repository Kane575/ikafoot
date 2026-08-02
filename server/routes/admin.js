import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { route } from '../lib/async-handler.js';
import {
  clearSession,
  issueSession,
  normalizePhone,
  readSession,
  requireAdmin,
} from '../lib/auth.js';
import { DAY_NAMES } from '../lib/schedule.js';
import { releaseExpiredHolds } from '../lib/slots-service.js';
import {
  HttpError,
  requireInt,
  requirePlayers,
  requireTime,
} from '../lib/validate.js';

const router = Router();

// Limiteur simple en mémoire : ralentit le bourrinage du mot de passe admin.
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 10 * 60 * 1000;

function checkRateLimit(key) {
  const entry = loginAttempts.get(key);
  if (!entry) return;

  if (entry.count >= MAX_ATTEMPTS && Date.now() - entry.first < LOCK_MS) {
    throw new HttpError(429, 'Trop de tentatives. Réessayez dans 10 minutes.');
  }
  if (Date.now() - entry.first >= LOCK_MS) {
    loginAttempts.delete(key);
  }
}

function registerFailure(key) {
  const entry = loginAttempts.get(key) ?? { count: 0, first: Date.now() };
  entry.count += 1;
  loginAttempts.set(key, entry);
}

router.post(
  '/login',
  route(async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const password = String(req.body?.password ?? '');

    checkRateLimit(phone || req.ip);

    if (!phone || !password) {
      throw new HttpError(400, 'Téléphone et mot de passe requis.');
    }

    const result = await query(
      'SELECT id, phone, name, password_hash FROM admins WHERE phone = $1',
      [phone]
    );
    const admin = result.rows[0];

    // Message identique dans les deux cas : on n'indique pas si le compte existe.
    const valid = admin && (await bcrypt.compare(password, admin.password_hash));
    if (!valid) {
      registerFailure(phone || req.ip);
      throw new HttpError(401, 'Téléphone ou mot de passe incorrect.');
    }

    loginAttempts.delete(phone);
    issueSession(res, admin);
    res.json({ admin: { name: admin.name, phone: admin.phone } });
  })
);

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ message: 'Déconnecté.' });
});

/** Permet au front de savoir, au chargement, si une session est encore valide. */
router.get('/me', (req, res) => {
  const session = readSession(req);
  if (!session) {
    return res.status(401).json({ message: 'Non connecté.' });
  }
  res.json({ admin: { name: session.name, phone: session.phone } });
});

router.use(requireAdmin);

/** Tableau de bord : réservations à venir + chiffre d'affaires confirmé. */
router.get(
  '/bookings',
  route(async (req, res) => {
    const scope = req.query.scope === 'all' ? 'all' : 'upcoming';
    await releaseExpiredHolds();

    const result = await query(
      `SELECT b.id,
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
         FROM bookings b
         JOIN slot_templates t ON t.id = b.template_id
        WHERE ($1 = 'all' OR b.booking_date >= CURRENT_DATE)
        ORDER BY b.booking_date DESC, t.start_time`,
      [scope]
    );

    const bookings = result.rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      customerName: row.customer_name,
      phone: row.phone,
      players: row.players,
      price: row.price,
      deposit: row.deposit,
      status: row.status,
      holdExpiresAt: row.hold_expires_at,
      date: row.date,
      start: row.start,
      end: row.end,
      createdAt: row.created_at,
    }));

    const withStatus = (status) => bookings.filter((booking) => booking.status === status);
    const sum = (list, field) => list.reduce((total, booking) => total + booking[field], 0);

    const confirmed = withStatus('confirmed');
    const pending = withStatus('pending');

    res.json({
      bookings,
      stats: {
        confirmed: confirmed.length,
        pending: pending.length,
        cancelled: withStatus('cancelled').length + withStatus('expired').length,
        revenue: sum(confirmed, 'price'),
        depositsCollected: sum(confirmed, 'deposit'),
        depositsAwaited: sum(pending, 'deposit'),
      },
    });
  })
);

/**
 * L'acompte est arrivé (mobile money, espèces) : le propriétaire le pointe ici,
 * et la réservation passe de « en attente » à « confirmée ».
 */
router.post(
  '/bookings/:id/confirm',
  route(async (req, res) => {
    const id = requireInt(req.params.id, 'La réservation', { min: 1 });

    let result;
    try {
      result = await query(
        `UPDATE bookings
            SET status = 'confirmed', confirmed_at = now(), hold_expires_at = NULL
          WHERE id = $1 AND status IN ('pending', 'expired')
          RETURNING id`,
        [id]
      );
    } catch (error) {
      // Le créneau avait été libéré puis repris : on ne peut pas le rendre.
      if (error.code === '23505') {
        throw new HttpError(409, 'Ce créneau a été repris par un autre client entre-temps.');
      }
      throw error;
    }

    if (result.rowCount === 0) {
      throw new HttpError(404, 'Réservation introuvable, déjà confirmée ou annulée.');
    }

    res.json({ message: 'Acompte encaissé, réservation confirmée.' });
  })
);

router.post(
  '/bookings/:id/cancel',
  route(async (req, res) => {
    const id = requireInt(req.params.id, 'La réservation', { min: 1 });

    const result = await query(
      `UPDATE bookings
          SET status = 'cancelled', cancelled_at = now(), hold_expires_at = NULL
        WHERE id = $1 AND status IN ('pending', 'confirmed')
        RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, 'Réservation introuvable ou déjà annulée.');
    }

    res.json({ message: 'Réservation annulée.' });
  })
);

/** Les créneaux types : c'est ici que le propriétaire pilote son planning. */
router.get(
  '/templates',
  route(async (req, res) => {
    const result = await query(
      `SELECT t.id,
              t.weekday,
              to_char(t.start_time, 'HH24:MI') AS start,
              to_char(t.end_time,   'HH24:MI') AS "end",
              t.players,
              t.weekday_price,
              t.weekend_price,
              t.active,
              (SELECT count(*) FROM bookings b
                WHERE b.template_id = t.id
                  AND b.status IN ('pending', 'confirmed')) AS booking_count
         FROM slot_templates t
        ORDER BY t.weekday, t.start_time`
    );

    res.json({
      dayNames: DAY_NAMES,
      templates: result.rows.map((row) => ({
        id: row.id,
        weekday: row.weekday,
        dayName: DAY_NAMES[row.weekday],
        start: row.start,
        end: row.end,
        players: row.players,
        weekdayPrice: row.weekday_price,
        weekendPrice: row.weekend_price,
        active: row.active,
        bookingCount: Number(row.booking_count),
      })),
    });
  })
);

function readTemplateBody(body) {
  const weekday = requireInt(body?.weekday, 'Le jour', { min: 0, max: 6 });
  const start = requireTime(body?.start, "L'heure de début");
  const end = requireTime(body?.end, "L'heure de fin");

  if (start === end) {
    throw new HttpError(400, 'Les heures de début et de fin doivent être différentes.');
  }

  return {
    weekday,
    start,
    end,
    players: requirePlayers(body?.players),
    weekdayPrice: requireInt(body?.weekdayPrice, 'Le prix en semaine', { max: 1_000_000 }),
    weekendPrice: requireInt(body?.weekendPrice, 'Le prix le week-end', { max: 1_000_000 }),
  };
}

router.post(
  '/templates',
  route(async (req, res) => {
    const data = readTemplateBody(req.body);

    try {
      const result = await query(
        `INSERT INTO slot_templates (weekday, start_time, end_time, players, weekday_price, weekend_price)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [data.weekday, data.start, data.end, data.players, data.weekdayPrice, data.weekendPrice]
      );

      res.status(201).json({ message: 'Créneau ajouté.', id: result.rows[0].id });
    } catch (error) {
      if (error.code === '23505') {
        throw new HttpError(409, `Un créneau démarre déjà à ${data.start} le ${DAY_NAMES[data.weekday].toLowerCase()}.`);
      }
      throw error;
    }
  })
);

router.put(
  '/templates/:id',
  route(async (req, res) => {
    const id = requireInt(req.params.id, 'Le créneau', { min: 1 });
    const data = readTemplateBody(req.body);
    const active = req.body?.active !== false;

    try {
      const result = await query(
        `UPDATE slot_templates
            SET weekday = $2, start_time = $3, end_time = $4, players = $5,
                weekday_price = $6, weekend_price = $7, active = $8
          WHERE id = $1
          RETURNING id`,
        [id, data.weekday, data.start, data.end, data.players, data.weekdayPrice, data.weekendPrice, active]
      );

      if (result.rowCount === 0) {
        throw new HttpError(404, 'Créneau introuvable.');
      }

      res.json({ message: 'Créneau mis à jour.' });
    } catch (error) {
      if (error.code === '23505') {
        throw new HttpError(409, `Un autre créneau démarre déjà à ${data.start} le ${DAY_NAMES[data.weekday].toLowerCase()}.`);
      }
      throw error;
    }
  })
);

/**
 * On ne supprime jamais un créneau qui porte des réservations : on le désactive,
 * sinon l'historique du propriétaire partirait avec.
 */
router.delete(
  '/templates/:id',
  route(async (req, res) => {
    const id = requireInt(req.params.id, 'Le créneau', { min: 1 });

    const used = await query(
      'SELECT 1 FROM bookings WHERE template_id = $1 LIMIT 1',
      [id]
    );

    if (used.rowCount > 0) {
      const result = await query(
        'UPDATE slot_templates SET active = FALSE WHERE id = $1 RETURNING id',
        [id]
      );
      if (result.rowCount === 0) {
        throw new HttpError(404, 'Créneau introuvable.');
      }
      return res.json({
        message: 'Créneau désactivé (il est conservé car des réservations y sont rattachées).',
      });
    }

    const result = await query('DELETE FROM slot_templates WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) {
      throw new HttpError(404, 'Créneau introuvable.');
    }

    res.json({ message: 'Créneau supprimé.' });
  })
);

export default router;
