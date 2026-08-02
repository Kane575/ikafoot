import { useCallback, useEffect, useMemo, useState } from 'react';
import { BOOKING_STATUS, api, formatDeadline, formatLongDate, formatPrice } from '../api.js';
import Modal from '../components/Modal.jsx';

const PLAYER_FORMATS = ['5 vs 5', '7 vs 7', '11 vs 11'];
const emptyForm = { customerName: '', phone: '', players: '5 vs 5' };

export default function BookingPage({ notify }) {
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeDate, setActiveDate] = useState(null);

  const [selectedSlot, setSelectedSlot] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  const [lookupPhone, setLookupPhone] = useState('');
  const [myBookings, setMyBookings] = useState(null);
  const [lookupBusy, setLookupBusy] = useState(false);

  const loadSchedule = useCallback(async () => {
    try {
      const data = await api.getSlots();
      setSchedule(data);
      setLoadError('');
      // On garde le jour choisi s'il est encore dans la fenêtre, sinon on
      // retombe sur le premier jour qui a de la place.
      setActiveDate((current) => {
        if (current && data.days.some((day) => day.date === current)) return current;
        const firstOpen = data.days.find((day) => day.availableCount > 0);
        return (firstOpen ?? data.days[0])?.date ?? null;
      });
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const activeDay = useMemo(
    () => schedule?.days.find((day) => day.date === activeDate) ?? null,
    [schedule, activeDate]
  );

  function openBooking(slot) {
    setSelectedSlot(slot);
    setFormError('');
    setConfirmation(null);
  }

  async function submitBooking(event) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setFormError('');

    try {
      const { booking } = await api.createBooking({
        templateId: selectedSlot.templateId,
        date: selectedSlot.date,
        customerName: form.customerName.trim(),
        phone: form.phone.trim(),
        players: form.players,
      });

      setConfirmation({ ...booking, dateLabel: formatLongDate(selectedSlot.date) });
      setSelectedSlot(null);
      setForm(emptyForm);
      notify('Créneau bloqué — il reste à verser l’acompte.');
      await loadSchedule();
    } catch (error) {
      // L'erreur reste dans la modale, à côté du formulaire à corriger.
      setFormError(error.message);
      if (error.status === 409) await loadSchedule();
    } finally {
      setSubmitting(false);
    }
  }

  async function runLookup(event) {
    event.preventDefault();
    setLookupBusy(true);

    try {
      const { bookings } = await api.lookupBookings(lookupPhone.trim());
      setMyBookings(bookings);
    } catch (error) {
      setMyBookings(null);
      notify(error.message, 'error');
    } finally {
      setLookupBusy(false);
    }
  }

  async function cancelMyBooking(booking) {
    const confirmed = window.confirm(
      `Annuler la réservation ${booking.reference} du ${formatLongDate(booking.date)} à ${booking.start} ?`
    );
    if (!confirmed) return;

    try {
      await api.cancelBooking(booking.reference, lookupPhone.trim());
      notify('Réservation annulée.');
      setMyBookings((current) =>
        current.map((item) =>
          item.reference === booking.reference ? { ...item, status: 'cancelled' } : item
        )
      );
      if (confirmation?.reference === booking.reference) setConfirmation(null);
      await loadSchedule();
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  if (loading) {
    return <p className="placeholder">Chargement du planning…</p>;
  }

  if (loadError) {
    return (
      <div className="panel panel--error">
        <h2>Planning indisponible</h2>
        <p>{loadError}</p>
        <button type="button" className="btn btn--primary" onClick={loadSchedule}>
          Réessayer
        </button>
      </div>
    );
  }

  // Les règles d'acompte viennent du serveur : elles ne sont écrites nulle part ici.
  const payment = schedule.payment ?? { depositPercent: 50, holdHours: 2, phone: '' };

  return (
    <>
      <section className="intro">
        <div>
          <h1>Réservez votre créneau</h1>
          <p className="muted">
            Choisissez un jour, puis une heure libre. Le créneau vous est gardé{' '}
            {payment.holdHours} h, le temps de verser {payment.depositPercent} %
            d’acompte — c’est lui qui confirme la réservation. Le reste se règle
            sur place.
          </p>
        </div>
        <div className="intro__stat">
          <strong>{schedule.availableCount}</strong>
          <span>
            créneaux libres
            <br />
            sur {schedule.horizonDays} jours
          </span>
        </div>
      </section>

      {confirmation && (
        <section className="panel panel--confirm">
          <h2>Créneau gardé pour vous, {confirmation.customerName}.</h2>
          <p>
            {confirmation.dateLabel} de {confirmation.start} à {confirmation.end} —{' '}
            {confirmation.players} — {formatPrice(confirmation.price)}
          </p>

          <p className="deposit-call">
            Versez <strong>{formatPrice(confirmation.deposit)}</strong> d’acompte
            {payment.phone && (
              <>
                {' '}
                au <a href={`tel:${payment.phone}`}>{payment.phone}</a>
              </>
            )}{' '}
            <strong>avant {formatDeadline(confirmation.holdExpiresAt)}</strong>. Sans
            acompte, le créneau repart à la vente. Le reste,{' '}
            {formatPrice(confirmation.price - confirmation.deposit)}, se règle sur place.
          </p>

          <p className="reference">
            Votre référence : <strong>{confirmation.reference}</strong>
          </p>
          <p className="muted">
            Notez-la : elle vous sert à annuler, et à être identifié quand vous
            envoyez l’acompte.
          </p>
          <button type="button" className="btn btn--ghost" onClick={() => setConfirmation(null)}>
            Fermer
          </button>
        </section>
      )}

      <section className="panel">
        <div className="panel__head">
          <h2>Planning</h2>
          {activeDay && (
            <p className="panel__hint">
              {activeDay.isWeekend ? 'Tarif week-end' : 'Tarif semaine'}
            </p>
          )}
        </div>

        <div className="day-strip" role="tablist" aria-label="Choisir un jour">
          {schedule.days.map((day) => {
            const [dayNumber, monthName] = day.dayLabel.split(' ');
            const isActive = day.date === activeDate;

            return (
              <button
                key={day.date}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`day${isActive ? ' is-active' : ''}${day.availableCount === 0 ? ' is-full' : ''}`}
                onClick={() => setActiveDate(day.date)}
              >
                <span className="day__name">
                  {day.isToday ? "Auj." : `${day.dayName.slice(0, 3)}.`}
                </span>
                <span className="day__number">{dayNumber}</span>
                <span className="day__month">{monthName}</span>
                <span className="day__state">
                  {day.availableCount === 0 ? 'complet' : `${day.availableCount} libre${day.availableCount > 1 ? 's' : ''}`}
                </span>
              </button>
            );
          })}
        </div>

        {!activeDay || activeDay.slots.length === 0 ? (
          <p className="placeholder">Aucun créneau n’est ouvert ce jour-là.</p>
        ) : (
          <ul className="slot-list">
            {activeDay.slots.map((slot) => (
              <li key={slot.templateId} className={`slot${slot.available ? '' : ' is-taken'}`}>
                <div className="slot__time">
                  <strong>{slot.start}</strong>
                  <span className="slot__end">→ {slot.end}</span>
                </div>
                <div className="slot__meta">
                  <span className="slot__players">{slot.players}</span>
                  <span className="slot__price">{formatPrice(slot.price)}</span>
                  <span className="slot__deposit">
                    acompte {formatPrice(slot.deposit)}
                  </span>
                </div>
                <div className="slot__action">
                  {slot.available ? (
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => openBooking(slot)}
                    >
                      Réserver
                    </button>
                  ) : (
                    <span className="tag">
                      {slot.past ? 'Passé' : slot.held ? 'Option en cours' : 'Déjà pris'}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Mes réservations</h2>
        <p className="muted">
          Entrez le numéro utilisé lors de la réservation pour la retrouver ou l’annuler.
        </p>

        <form className="inline-form" onSubmit={runLookup}>
          <label className="field">
            <span>Téléphone</span>
            <input
              type="tel"
              inputMode="numeric"
              value={lookupPhone}
              onChange={(event) => setLookupPhone(event.target.value)}
              placeholder="76 00 00 00"
              required
            />
          </label>
          <button type="submit" className="btn btn--primary" disabled={lookupBusy}>
            {lookupBusy ? 'Recherche…' : 'Rechercher'}
          </button>
        </form>

        {myBookings !== null &&
          (myBookings.length === 0 ? (
            <p className="placeholder">Aucune réservation trouvée pour ce numéro.</p>
          ) : (
            <ul className="booking-list">
              {myBookings.map((booking) => {
                const status = BOOKING_STATUS[booking.status] ?? BOOKING_STATUS.cancelled;
                const isLive = booking.status === 'pending' || booking.status === 'confirmed';

                return (
                  <li key={booking.reference} className="booking">
                    <div>
                      <strong>{formatLongDate(booking.date)}</strong>
                      <span className="muted">
                        {booking.start} – {booking.end} · {booking.players} ·{' '}
                        {formatPrice(booking.price)}
                      </span>
                      <span className={`tag tag--${status.tone}`}>{status.label}</span>
                      {booking.status === 'pending' && (
                        <span className="muted">
                          {formatPrice(booking.deposit)} à verser avant{' '}
                          {formatDeadline(booking.holdExpiresAt)}
                        </span>
                      )}
                      <span className="reference-inline">{booking.reference}</span>
                    </div>
                    {isLive && (
                      <button
                        type="button"
                        className="btn btn--danger"
                        onClick={() => cancelMyBooking(booking)}
                      >
                        Annuler
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ))}
      </section>

      {selectedSlot && (
        <Modal
          title="Réserver ce créneau"
          subtitle={`${formatLongDate(selectedSlot.date)} · ${selectedSlot.start} – ${selectedSlot.end} · ${formatPrice(selectedSlot.price)}`}
          onClose={() => setSelectedSlot(null)}
        >
          <p className="deposit-note">
            Acompte de <strong>{formatPrice(selectedSlot.deposit)}</strong> à verser
            dans les {payment.holdHours} h pour confirmer. Le créneau est bloqué
            pendant ce délai.
          </p>

          <form className="stacked-form" onSubmit={submitBooking}>
            <label className="field">
              <span>Nom complet</span>
              <input
                type="text"
                value={form.customerName}
                onChange={(event) => setForm({ ...form, customerName: event.target.value })}
                required
                minLength={2}
                maxLength={120}
              />
            </label>

            <label className="field">
              <span>Téléphone</span>
              <input
                type="tel"
                inputMode="numeric"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="76 00 00 00"
                required
              />
            </label>

            <label className="field">
              <span>Format du match</span>
              <select
                value={form.players}
                onChange={(event) => setForm({ ...form, players: event.target.value })}
              >
                {PLAYER_FORMATS.map((format) => (
                  <option key={format}>{format}</option>
                ))}
              </select>
            </label>

            {formError && <p className="form-error">{formError}</p>}

            <div className="form-actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setSelectedSlot(null)}
              >
                Annuler
              </button>
              <button type="submit" className="btn btn--primary" disabled={submitting}>
                {submitting ? 'Envoi…' : 'Bloquer le créneau'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
