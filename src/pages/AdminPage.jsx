import { useCallback, useEffect, useState } from 'react';
import { BOOKING_STATUS, api, formatDeadline, formatLongDate, formatPrice } from '../api.js';
import Modal from '../components/Modal.jsx';

const PLAYER_FORMATS = ['5 vs 5', '7 vs 7', '11 vs 11'];
const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const emptyTemplate = {
  weekday: 0,
  start: '18:00',
  end: '19:00',
  players: '5 vs 5',
  weekdayPrice: 25000,
  weekendPrice: 30000,
  active: true,
};

export default function AdminPage({ notify }) {
  const [admin, setAdmin] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [tab, setTab] = useState('bookings');

  // La session vit dans un cookie httpOnly : on demande au serveur si elle est
  // encore valide, plutôt que de faire confiance à un état local.
  useEffect(() => {
    api
      .adminMe()
      .then((data) => setAdmin(data.admin))
      .catch(() => setAdmin(null))
      .finally(() => setCheckingSession(false));
  }, []);

  async function logout() {
    try {
      await api.adminLogout();
    } finally {
      setAdmin(null);
      notify('Vous êtes déconnecté.');
    }
  }

  // Une session expirée pendant l'utilisation renvoie l'écran de connexion
  // au lieu de laisser des boutons qui échouent en silence.
  const handleAuthError = useCallback(
    (error) => {
      if (error.status === 401) {
        setAdmin(null);
        notify('Session expirée, reconnectez-vous.', 'error');
        return true;
      }
      return false;
    },
    [notify]
  );

  if (checkingSession) {
    return <p className="placeholder">Vérification de la session…</p>;
  }

  if (!admin) {
    return <LoginForm onSuccess={setAdmin} notify={notify} />;
  }

  return (
    <>
      <section className="intro intro--admin">
        <div>
          <h1>Espace propriétaire</h1>
          <p className="muted">Connecté en tant que {admin.name}.</p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={logout}>
          Se déconnecter
        </button>
      </section>

      <div className="tabs">
        <button
          type="button"
          className={`tab${tab === 'bookings' ? ' is-active' : ''}`}
          onClick={() => setTab('bookings')}
        >
          Réservations
        </button>
        <button
          type="button"
          className={`tab${tab === 'templates' ? ' is-active' : ''}`}
          onClick={() => setTab('templates')}
        >
          Créneaux et tarifs
        </button>
      </div>

      {tab === 'bookings' ? (
        <BookingsTab notify={notify} onAuthError={handleAuthError} />
      ) : (
        <TemplatesTab notify={notify} onAuthError={handleAuthError} />
      )}
    </>
  );
}

function LoginForm({ onSuccess, notify }) {
  const [form, setForm] = useState({ phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      const data = await api.adminLogin(form);
      onSuccess(data.admin);
      notify('Connexion réussie.');
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel panel--narrow">
      <h1>Espace propriétaire</h1>
      <p className="muted">Réservé au gérant du terrain.</p>

      <form className="stacked-form" onSubmit={submit}>
        <label className="field">
          <span>Téléphone</span>
          <input
            type="tel"
            inputMode="numeric"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            autoComplete="username"
            required
          />
        </label>

        <label className="field">
          <span>Mot de passe</span>
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </section>
  );
}

function BookingsTab({ notify, onAuthError }) {
  const [data, setData] = useState(null);
  const [scope, setScope] = useState('upcoming');
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (nextScope) => {
      setLoading(true);
      try {
        setData(await api.adminBookings(nextScope));
      } catch (error) {
        if (!onAuthError(error)) notify(error.message, 'error');
      } finally {
        setLoading(false);
      }
    },
    [notify, onAuthError]
  );

  useEffect(() => {
    load(scope);
  }, [load, scope]);

  async function cancel(booking) {
    const confirmed = window.confirm(
      `Annuler la réservation de ${booking.customerName} le ${formatLongDate(booking.date)} à ${booking.start} ?`
    );
    if (!confirmed) return;

    try {
      await api.adminCancelBooking(booking.id);
      notify('Réservation annulée.');
      await load(scope);
    } catch (error) {
      if (!onAuthError(error)) notify(error.message, 'error');
    }
  }

  async function confirmDeposit(booking) {
    const confirmed = window.confirm(
      `Confirmer avoir reçu l’acompte de ${formatPrice(booking.deposit)} de ${booking.customerName} ?`
    );
    if (!confirmed) return;

    try {
      const result = await api.adminConfirmBooking(booking.id);
      notify(result.message);
      await load(scope);
    } catch (error) {
      if (!onAuthError(error)) notify(error.message, 'error');
    }
  }

  if (loading && !data) return <p className="placeholder">Chargement…</p>;
  if (!data) return null;

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>{scope === 'upcoming' ? 'Réservations à venir' : 'Toutes les réservations'}</h2>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setScope(scope === 'upcoming' ? 'all' : 'upcoming')}
        >
          {scope === 'upcoming' ? 'Voir l’historique' : 'Voir uniquement à venir'}
        </button>
      </div>

      <div className="stats">
        <div className="stat">
          <span>Confirmées</span>
          <strong>{data.stats.confirmed}</strong>
        </div>
        <div className="stat">
          <span>En attente d’acompte</span>
          <strong>{data.stats.pending}</strong>
          <span className="stat__hint">{formatPrice(data.stats.depositsAwaited)} à encaisser</span>
        </div>
        <div className="stat">
          <span>Annulées</span>
          <strong>{data.stats.cancelled}</strong>
        </div>
        <div className="stat">
          <span>Acomptes encaissés</span>
          <strong>{formatPrice(data.stats.depositsCollected)}</strong>
        </div>
        <div className="stat">
          <span>Recettes attendues</span>
          <strong>{formatPrice(data.stats.revenue)}</strong>
        </div>
      </div>

      {data.bookings.length === 0 ? (
        <p className="placeholder">Aucune réservation pour l’instant.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Horaire</th>
                <th>Client</th>
                <th>Téléphone</th>
                <th>Format</th>
                <th>Prix</th>
                <th>Acompte</th>
                <th>État</th>
                <th>Réf.</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.bookings.map((booking) => {
                const status = BOOKING_STATUS[booking.status] ?? BOOKING_STATUS.cancelled;
                const isDead = booking.status === 'cancelled' || booking.status === 'expired';

                return (
                  // Les `data-label` ne servent à rien sur grand écran : sous
                  // 760 px, le tableau devient une pile de fiches et c'est eux
                  // qui portent le nom de chaque champ.
                  <tr key={booking.id} className={isDead ? 'is-cancelled' : undefined}>
                    <td data-label="Date">{formatLongDate(booking.date)}</td>
                    <td data-label="Horaire">
                      {booking.start} – {booking.end}
                    </td>
                    <td data-label="Client">{booking.customerName}</td>
                    <td data-label="Téléphone">
                      <a href={`tel:${booking.phone}`}>{booking.phone}</a>
                    </td>
                    <td data-label="Format">{booking.players}</td>
                    <td data-label="Prix">{formatPrice(booking.price)}</td>
                    <td data-label="Acompte">{formatPrice(booking.deposit)}</td>
                    <td data-label="État">
                      {/* Regroupés : sinon le délai part seul à la ligne
                          quand la cellule devient une fiche sur mobile. */}
                      <span className="cell-stack">
                        <span className={`tag tag--${status.tone}`}>{status.label}</span>
                        {booking.status === 'pending' && booking.holdExpiresAt && (
                          <span className="muted">jusqu’à {formatDeadline(booking.holdExpiresAt)}</span>
                        )}
                      </span>
                    </td>
                    <td data-label="Réf." className="mono">{booking.reference}</td>
                    <td className="row-actions">
                      {booking.status === 'pending' && (
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          onClick={() => confirmDeposit(booking)}
                        >
                          Acompte reçu
                        </button>
                      )}
                      {(booking.status === 'pending' || booking.status === 'confirmed') && (
                        <button type="button" className="btn btn--danger btn--sm" onClick={() => cancel(booking)}>
                          Annuler
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TemplatesTab({ notify, onAuthError }) {
  const [templates, setTemplates] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.adminTemplates();
      setTemplates(data.templates);
    } catch (error) {
      if (!onAuthError(error)) notify(error.message, 'error');
    }
  }, [notify, onAuthError]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(template) {
    const confirmed = window.confirm(
      `Supprimer le créneau du ${template.dayName.toLowerCase()} ${template.start} – ${template.end} ?`
    );
    if (!confirmed) return;

    try {
      const result = await api.adminDeleteTemplate(template.id);
      notify(result.message);
      await load();
    } catch (error) {
      if (!onAuthError(error)) notify(error.message, 'error');
    }
  }

  async function toggleActive(template) {
    try {
      await api.adminUpdateTemplate(template.id, { ...template, active: !template.active });
      notify(template.active ? 'Créneau désactivé.' : 'Créneau réactivé.');
      await load();
    } catch (error) {
      if (!onAuthError(error)) notify(error.message, 'error');
    }
  }

  if (!templates) return <p className="placeholder">Chargement…</p>;

  const byDay = DAY_NAMES.map((dayName, weekday) => ({
    weekday,
    dayName,
    items: templates.filter((template) => template.weekday === weekday),
  }));

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2>Créneaux hebdomadaires</h2>
          <p className="muted">
            Ces horaires se répètent chaque semaine. Le planning client affiche les
            7 prochains jours à partir d’aujourd’hui.
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => setEditing(emptyTemplate)}>
          Ajouter un créneau
        </button>
      </div>

      <div className="template-days">
        {byDay.map((day) => (
          <div key={day.weekday} className="template-day">
            <h3>
              {day.dayName}
              {day.weekday >= 5 && <span className="tag tag--soft">tarif week-end</span>}
            </h3>

            {day.items.length === 0 ? (
              <p className="placeholder placeholder--sm">Fermé.</p>
            ) : (
              <ul className="template-list">
                {day.items.map((template) => (
                  <li key={template.id} className={`template${template.active ? '' : ' is-inactive'}`}>
                    <div>
                      <strong>
                        {template.start} – {template.end}
                      </strong>
                      <span className="muted">
                        {template.players} · {formatPrice(template.weekdayPrice)} en semaine ·{' '}
                        {formatPrice(template.weekendPrice)} le week-end
                      </span>
                      {!template.active && <span className="tag tag--muted">Inactif</span>}
                    </div>
                    <div className="template__actions">
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(template)}>
                        Modifier
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => toggleActive(template)}>
                        {template.active ? 'Désactiver' : 'Activer'}
                      </button>
                      <button type="button" className="btn btn--danger btn--sm" onClick={() => remove(template)}>
                        Supprimer
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <TemplateModal
          template={editing}
          notify={notify}
          onAuthError={onAuthError}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </section>
  );
}

function TemplateModal({ template, onClose, onSaved, notify, onAuthError }) {
  const [form, setForm] = useState(template);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isNew = !template.id;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const payload = {
      weekday: Number(form.weekday),
      start: form.start,
      end: form.end,
      players: form.players,
      weekdayPrice: Number(form.weekdayPrice),
      weekendPrice: Number(form.weekendPrice),
      active: form.active !== false,
    };

    try {
      const result = isNew
        ? await api.adminCreateTemplate(payload)
        : await api.adminUpdateTemplate(template.id, payload);
      notify(result.message);
      await onSaved();
    } catch (apiError) {
      if (onAuthError(apiError)) return;
      setError(apiError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={isNew ? 'Nouveau créneau' : 'Modifier le créneau'}
      subtitle="Il se répétera chaque semaine ce jour-là."
      onClose={onClose}
    >
      <form className="stacked-form" onSubmit={submit}>
        <label className="field">
          <span>Jour</span>
          <select
            value={form.weekday}
            onChange={(event) => setForm({ ...form, weekday: Number(event.target.value) })}
          >
            {DAY_NAMES.map((dayName, index) => (
              <option key={dayName} value={index}>
                {dayName}
              </option>
            ))}
          </select>
        </label>

        <div className="field-row">
          <label className="field">
            <span>Début</span>
            <input
              type="time"
              value={form.start}
              onChange={(event) => setForm({ ...form, start: event.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>Fin</span>
            <input
              type="time"
              value={form.end}
              onChange={(event) => setForm({ ...form, end: event.target.value })}
              required
            />
          </label>
        </div>

        <label className="field">
          <span>Format</span>
          <select
            value={form.players}
            onChange={(event) => setForm({ ...form, players: event.target.value })}
          >
            {PLAYER_FORMATS.map((format) => (
              <option key={format}>{format}</option>
            ))}
          </select>
        </label>

        <div className="field-row">
          <label className="field">
            <span>Prix en semaine (FCFA)</span>
            <input
              type="number"
              min="0"
              step="500"
              value={form.weekdayPrice}
              onChange={(event) => setForm({ ...form, weekdayPrice: event.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>Prix le week-end (FCFA)</span>
            <input
              type="number"
              min="0"
              step="500"
              value={form.weekendPrice}
              onChange={(event) => setForm({ ...form, weekendPrice: event.target.value })}
              required
            />
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
