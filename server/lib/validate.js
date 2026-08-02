export const PLAYER_FORMATS = ['5 vs 5', '7 vs 7', '11 vs 11'];

/** Erreur métier : le gestionnaire d'erreurs la traduit en réponse HTTP propre. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function requireText(value, field, { max = 120, min = 2 } = {}) {
  const text = String(value ?? '').trim();
  if (text.length < min) {
    throw new HttpError(400, `${field} est requis.`);
  }
  if (text.length > max) {
    throw new HttpError(400, `${field} ne doit pas dépasser ${max} caractères.`);
  }
  return text;
}

export function requirePhone(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  if (digits.length < 8 || digits.length > 15) {
    throw new HttpError(400, 'Numéro de téléphone invalide (8 chiffres minimum).');
  }
  return digits;
}

export function requireInt(value, field, { min = 0, max = 10_000_000 } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new HttpError(400, `${field} doit être un nombre entier entre ${min} et ${max}.`);
  }
  return number;
}

export function requirePlayers(value) {
  const players = String(value ?? '').trim();
  if (!PLAYER_FORMATS.includes(players)) {
    throw new HttpError(400, `Format de match invalide (${PLAYER_FORMATS.join(', ')}).`);
  }
  return players;
}

export function requireTime(value, field) {
  const time = String(value ?? '').trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new HttpError(400, `${field} doit être au format HH:MM.`);
  }
  return time;
}

/** Code court, lisible au téléphone, sans caractères ambigus (0/O, 1/I). */
export function generateReference() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `IKA-${code}`;
}
