import { useEffect, useMemo, useState } from 'react';
import { api, formatPrice } from '../api.js';
import PitchIllustration from '../components/PitchIllustration.jsx';

/**
 * La vitrine. Elle doit convaincre en dix secondes et rester lisible même si
 * l'API ne répond pas : le texte s'affiche tout de suite, les chiffres (tarifs,
 * places libres) viennent se poser dessus quand le planning est chargé.
 *
 * Chaque section est une bande pleine largeur (`.band`) qui pose elle-même sa
 * couleur ; le contenu, lui, reste centré dans un `.container`.
 */

// Photos servies depuis `public/`. Mettez `null` pour revenir à l'illustration.
const PITCH_PHOTO = '/terrain.jpg';
const GOAL_PHOTO = '/terrain-but.jpg';

// N'annoncez que ce qui existe vraiment sur votre terrain : cette liste est le
// seul endroit à modifier. Décommentez ou ajoutez selon vos équipements.
const AMENITIES = [
  { title: 'Gazon synthétique', note: 'Une surface régulière, jouable même après la pluie.' },
  { title: 'Terrain éclairé', note: 'Les créneaux vont jusqu’à 2 h du matin.' },
  { title: 'Créneaux d’une heure', note: 'Vous payez le temps que vous jouez, pas plus.' },
  { title: '5 vs 5, 7 vs 7, 11 vs 11', note: 'Le format se choisit au moment de réserver.' },
  // { title: 'Vestiaires', note: 'Douches et casiers sur place.' },
  // { title: 'Parking', note: 'Stationnement gratuit devant le terrain.' },
];

const STEPS = [
  {
    title: 'Choisissez votre heure',
    body: 'Le planning des 7 prochains jours est en ligne, mis à jour en direct. Un créneau affiché libre l’est vraiment.',
  },
  {
    title: 'Versez l’acompte',
    body: 'La moitié du prix, par mobile money, avec votre référence. C’est ce qui bloque le terrain à votre nom.',
  },
  {
    title: 'Jouez',
    body: 'Vous réglez le reste sur place le jour du match. Présentez simplement votre référence en arrivant.',
  },
];

export default function HomePage({ navigate, phoneDisplay, phoneLink }) {
  const [schedule, setSchedule] = useState(null);

  // Un échec de chargement ne doit pas vider la vitrine : on l'ignore
  // volontairement et la page reste complète, sans les chiffres.
  useEffect(() => {
    let cancelled = false;
    api
      .getSlots()
      .then((data) => {
        if (!cancelled) setSchedule(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Tarifs lus dans le planning réel — prix *et* acompte, tels que le serveur
  // les calcule. Changer un prix côté admin met la vitrine à jour, sans code.
  const rates = useMemo(() => {
    const cheapest = (weekend) => {
      const slots = (schedule?.days ?? [])
        .filter((day) => day.isWeekend === weekend)
        .flatMap((day) => day.slots);

      if (slots.length === 0) return null;
      return slots.reduce((low, slot) => (slot.price < low.price ? slot : low));
    };

    return { weekday: cheapest(false), weekend: cheapest(true) };
  }, [schedule]);

  const depositPercent = schedule?.payment?.depositPercent ?? 50;
  const goToBooking = () => navigate('/reserver');

  return (
    <>
      <section className="hero">
        <div className="hero__media">
          {PITCH_PHOTO ? (
            <img src={PITCH_PHOTO} alt="" />
          ) : (
            <PitchIllustration />
          )}
        </div>

        <div className="container hero__inner">
          <p className="eyebrow eyebrow--light">Terrain synthétique · Bamako</p>
          <h1>
            Le terrain est libre.
            <br />
            Prenez votre heure.
          </h1>
          <p className="hero__lead">
            Ouvert de 6 h du matin à 2 h, sept jours sur sept. Vous réservez en
            ligne en une minute, vous versez {depositPercent} % d’acompte, et le
            terrain est à vous.
          </p>

          <div className="hero__actions">
            <button type="button" className="btn btn--accent btn--lg" onClick={goToBooking}>
              Réserver un créneau
            </button>
            <a className="btn btn--outline btn--lg" href={`tel:${phoneLink}`}>
              Appeler le {phoneDisplay}
            </a>
          </div>

          <ul className="hero__facts">
            <li>
              <strong>20 h</strong>
              <span>d’ouverture par jour</span>
            </li>
            <li>
              <strong>7 j / 7</strong>
              <span>week-ends compris</span>
            </li>
            <li>
              <strong>{schedule ? schedule.availableCount : '—'}</strong>
              <span>créneaux libres cette semaine</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="band">
        <div className="container">
          <header className="band__head">
            <p className="eyebrow">En trois étapes</p>
            <h2>Comment ça marche</h2>
          </header>

          <ol className="steps">
            {STEPS.map((step, index) => (
              <li key={step.title} className="step">
                <span className="step__number">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="band band--tint">
        <div className="container">
          <header className="band__head">
            <p className="eyebrow">Tarifs</p>
            <h2>Le prix d’une heure de terrain</h2>
          </header>

          <div className="rates">
            <RateCard
              label="Du lundi au vendredi"
              slot={rates.weekday}
              depositPercent={depositPercent}
            />
            <RateCard
              label="Samedi et dimanche"
              slot={rates.weekend}
              depositPercent={depositPercent}
              highlight
            />
          </div>

          <p className="rates__note">
            L’acompte se verse par mobile money au {phoneDisplay} et confirme votre
            réservation. Le solde se règle sur place, avant le match. Vous pouvez
            annuler vous-même en ligne avec votre numéro de téléphone.
          </p>
        </div>
      </section>

      <section className="band band--dark">
        <div className="container terrain">
          <div className="terrain__photo">
            <img src={GOAL_PHOTO} alt="Le gazon synthétique et les buts du terrain" />
          </div>

          <div className="terrain__text">
            <p className="eyebrow eyebrow--light">Le terrain</p>
            <h2>Ce que vous trouvez sur place</h2>
            <ul className="amenities">
              {AMENITIES.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.note}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {schedule && (
        <section className="band">
          <div className="container">
            <header className="band__head">
              <p className="eyebrow">Disponibilités</p>
              <h2>Les 7 prochains jours</h2>
            </header>

            <ul className="week">
              {schedule.days.map((day) => (
                <li
                  key={day.date}
                  className={`week__day${day.availableCount === 0 ? ' is-full' : ''}`}
                >
                  <span className="week__name">{day.isToday ? 'Aujourd’hui' : day.dayName}</span>
                  <strong>{day.availableCount}</strong>
                  <span className="week__note">
                    {day.availableCount === 0
                      ? 'complet'
                      : `libre${day.availableCount > 1 ? 's' : ''}`}
                  </span>
                </li>
              ))}
            </ul>

            <div className="band__cta">
              <button type="button" className="btn btn--primary" onClick={goToBooking}>
                Voir le planning détaillé
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="band band--sand">
        <div className="container">
          <header className="band__head">
            <p className="eyebrow eyebrow--accent">Bon à savoir</p>
            <h2>Questions fréquentes</h2>
          </header>

          <div className="faq">
            <Question question="Pourquoi un acompte ?">
              Parce qu’un créneau bloqué et jamais payé, c’est un terrain vide et
              d’autres joueurs refusés. L’acompte vaut engagement : une fois versé,
              l’heure est à vous, personne d’autre ne peut la prendre.
            </Question>
            <Question question="Et si je ne verse pas l’acompte tout de suite ?">
              Le créneau vous est gardé quelques heures. Passé ce délai sans
              paiement, il repart automatiquement à la réservation — vous n’avez
              rien à faire, et rien à payer.
            </Question>
            <Question question="Comment j’annule ?">
              Depuis la page de réservation, avec votre numéro de téléphone et
              votre référence. Prévenez-nous au plus tôt : ça libère l’heure pour
              une autre équipe.
            </Question>
            <Question question="On peut jouer à quel format ?">
              5 vs 5, 7 vs 7 ou 11 vs 11 : vous choisissez le format au moment de
              réserver, le tarif de l’heure ne change pas.
            </Question>
          </div>
        </div>
      </section>

      <section className="band band--final">
        <div className="container final">
          <div>
            <h2>Prêt à jouer ?</h2>
            <p>Le planning des 7 prochains jours vous attend.</p>
          </div>
          <div className="final__actions">
            <button type="button" className="btn btn--accent btn--lg" onClick={goToBooking}>
              Réserver maintenant
            </button>
            <a className="btn btn--outline btn--lg" href={`tel:${phoneLink}`}>
              {phoneDisplay}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

function RateCard({ label, slot, depositPercent, highlight = false }) {
  return (
    <div className={`rate${highlight ? ' rate--highlight' : ''}`}>
      <span className="rate__label">{label}</span>
      <strong className="rate__price">
        {slot ? formatPrice(slot.price) : '—'}
        <span> / heure</span>
      </strong>
      <span className="rate__deposit">
        {slot
          ? `Acompte : ${formatPrice(slot.deposit)}`
          : `Acompte de ${depositPercent} % à la réservation`}
      </span>
    </div>
  );
}

function Question({ question, children }) {
  return (
    <details className="faq__item">
      <summary>{question}</summary>
      <p>{children}</p>
    </details>
  );
}
