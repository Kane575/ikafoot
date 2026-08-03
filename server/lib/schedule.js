// Le Mali est en UTC+0 toute l'année : on peut raisonner en UTC sans décalage.
// Toutes les dates circulent au format ISO 'YYYY-MM-DD' pour éviter les surprises
// de fuseau entre le navigateur, Node et PostgreSQL.

export const DAY_NAMES = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
];

const MONTH_NAMES = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

export const HORIZON_DAYS = 7;

/** 0 = lundi ... 6 = dimanche (JS renvoie 0 = dimanche). */
export function weekdayIndex(date) {
  return (date.getUTCDay() + 6) % 7;
}

export function isWeekend(weekday) {
  return weekday >= 5;
}

export function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

export function parseISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function today() {
  return parseISODate(toISODate(new Date()));
}

export function addDays(date, amount) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

/** « 2026-08-01 » -> « 1 août ». */
export function formatDayLabel(date) {
  return `${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]}`;
}

/** PostgreSQL renvoie les TIME en 'HH:MM:SS' ; on n'affiche que 'HH:MM'. */
export function formatTime(value) {
  return String(value).slice(0, 5);
}

/**
 * Les jours ouverts à la réservation, à partir d'aujourd'hui.
 * C'est ce qui remplace le planning écrit en dur : l'app ne périme jamais.
 */
export function rollingDays(count = HORIZON_DAYS, from = today()) {
  return Array.from({ length: count }, (_, offset) => {
    const date = addDays(from, offset);
    const weekday = weekdayIndex(date);

    return {
      date: toISODate(date),
      weekday,
      dayName: DAY_NAMES[weekday],
      dayLabel: formatDayLabel(date),
      isWeekend: isWeekend(weekday),
      isToday: offset === 0,
    };
  });
}

/** Une date est réservable si elle tombe dans la fenêtre glissante. */
export function isDateInHorizon(isoDate, count = HORIZON_DAYS) {
  const date = parseISODate(isoDate);
  if (!date) return false;

  const start = today();
  const end = addDays(start, count - 1);
  return date >= start && date <= end;
}

/**
 * Un créneau du jour dont l'heure de début est déjà passée n'est plus réservable.
 * Les créneaux de nuit (22:00 -> 04:00) restent rattachés à leur jour de début.
 */
export function isSlotPast(isoDate, startTime, now = new Date()) {
  const date = parseISODate(isoDate);
  if (!date) return true;

  const [hours, minutes] = formatTime(startTime).split(':').map(Number);
  const start = new Date(date.getTime());
  start.setUTCHours(hours, minutes, 0, 0);
  return start.getTime() <= now.getTime();
}

export function priceFor(template, weekend) {
  return weekend ? template.weekend_price : template.weekday_price;
}

/** Part du prix à verser d'avance pour garantir le créneau. */
export const DEPOSIT_RATIO = 0.5;

/**
 * Délai laissé au client pour verser l'acompte avant que le créneau soit rendu.
 * Court volontairement : un créneau bloqué est un créneau refusé aux autres.
 */
export const HOLD_MINUTES = Number(process.env.BOOKING_HOLD_MINUTES) || 20;

/** Numéro sur lequel l'acompte est envoyé (mobile money). */
export const PAYMENT_PHONE = process.env.PAYMENT_PHONE || process.env.ADMIN_PHONE || '';

/** 25 000 -> 12 500. Arrondi au franc supérieur pour ne jamais sous-facturer. */
export function depositFor(price) {
  return Math.ceil(price * DEPOSIT_RATIO);
}

/**
 * Jusqu'à quand le créneau reste bloqué sans acompte. Jamais au-delà du début
 * du match : un créneau qui commence dans une heure ne peut pas être tenu deux.
 */
export function holdExpiresAt(isoDate, startTime, now = new Date()) {
  const limit = new Date(now.getTime() + HOLD_MINUTES * 60 * 1000);
  const date = parseISODate(isoDate);
  if (!date) return limit;

  const [hours, minutes] = formatTime(startTime).split(':').map(Number);
  const start = new Date(date.getTime());
  start.setUTCHours(hours, minutes, 0, 0);

  return start < limit ? start : limit;
}
