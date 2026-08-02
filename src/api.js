/**
 * Point d'entrée unique vers l'API. Toute erreur remonte avec le message
 * renvoyé par le serveur : l'interface n'invente jamais un succès.
 */

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, params } = {}) {
  const url = new URL(path, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    }
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'include', // indispensable : la session admin vit dans un cookie httpOnly
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Serveur injoignable. Vérifiez votre connexion.', 0);
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new ApiError(data.message || 'Une erreur est survenue.', response.status);
  }

  return data;
}

export const api = {
  getSlots: () => request('/api/slots'),

  createBooking: (payload) => request('/api/bookings', { method: 'POST', body: payload }),

  lookupBookings: (phone) => request('/api/bookings/lookup', { params: { phone } }),

  cancelBooking: (reference, phone) =>
    request(`/api/bookings/${encodeURIComponent(reference)}/cancel`, {
      method: 'POST',
      body: { phone },
    }),

  adminLogin: (payload) => request('/api/admin/login', { method: 'POST', body: payload }),
  adminLogout: () => request('/api/admin/logout', { method: 'POST' }),
  adminMe: () => request('/api/admin/me'),

  adminBookings: (scope = 'upcoming') => request('/api/admin/bookings', { params: { scope } }),
  adminCancelBooking: (id) => request(`/api/admin/bookings/${id}/cancel`, { method: 'POST' }),
  adminConfirmBooking: (id) => request(`/api/admin/bookings/${id}/confirm`, { method: 'POST' }),

  adminTemplates: () => request('/api/admin/templates'),
  adminCreateTemplate: (payload) => request('/api/admin/templates', { method: 'POST', body: payload }),
  adminUpdateTemplate: (id, payload) =>
    request(`/api/admin/templates/${id}`, { method: 'PUT', body: payload }),
  adminDeleteTemplate: (id) => request(`/api/admin/templates/${id}`, { method: 'DELETE' }),
};

/** 3500 -> « 3 500 FCFA » */
export function formatPrice(amount) {
  return `${Number(amount).toLocaleString('fr-FR')} FCFA`;
}

/** Libellés des quatre états possibles d'une réservation. */
export const BOOKING_STATUS = {
  pending: { label: 'En attente d’acompte', tone: 'warn' },
  confirmed: { label: 'Confirmée', tone: 'ok' },
  cancelled: { label: 'Annulée', tone: 'muted' },
  expired: { label: 'Acompte non reçu', tone: 'muted' },
};

/** Horodatage ISO -> « aujourd'hui à 14:30 » / « le 3 août à 09:00 ». */
export function formatDeadline(value) {
  if (!value) return '';
  const date = new Date(value);
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const sameDay = date.toDateString() === new Date().toDateString();

  return sameDay
    ? `aujourd’hui à ${time}`
    : `le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à ${time}`;
}

/** '2026-08-03' -> « dimanche 3 août » */
export function formatLongDate(isoDate) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}
