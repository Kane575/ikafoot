import { useCallback, useEffect, useState } from 'react';
import HomePage from './pages/HomePage.jsx';
import BookingPage from './pages/BookingPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import Toast from './components/Toast.jsx';

const PHONE_DISPLAY = '76 73 37 49';
const PHONE_LINK = '+22376733749';

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const navigate = useCallback((next) => {
    if (next === window.location.pathname) return;
    window.history.pushState({}, '', next);
    setPath(next);
    window.scrollTo(0, 0);
  }, []);

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type, key: Date.now() });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const isAdmin = path.startsWith('/admin');
  const isBooking = path.startsWith('/reserver');
  const isHome = !isAdmin && !isBooking;

  // Un lien interne : il navigue sans recharger la page, mais reste un vrai
  // href, donc « ouvrir dans un nouvel onglet » et le clic droit fonctionnent.
  const link = (to) => ({
    href: to,
    onClick: (event) => {
      event.preventDefault();
      navigate(to);
    },
  });

  return (
    <>
      <header className="site-header">
        <div className="container site-header__inner">
          <a className="wordmark" {...link('/')}>
            <span className="wordmark__mark" aria-hidden="true" />
            <span>
              IKAFOOT
              <small>Terrain synthétique · Bamako</small>
            </span>
          </a>

          {/* Les liens au centre, l'action au bout : on lit le nom, on choisit
              la page, on appelle. L'espace propriétaire n'est pas listé — il
              s'atteint directement par /admin. */}
          <nav className="site-nav">
            {isAdmin ? (
              <a className="site-nav__link" {...link('/')}>
                Retour au site
              </a>
            ) : (
              <>
                <a className={`site-nav__link${isHome ? ' is-active' : ''}`} {...link('/')}>
                  Accueil
                </a>
                <a className={`site-nav__link${isBooking ? ' is-active' : ''}`} {...link('/reserver')}>
                  Réserver
                </a>
              </>
            )}
          </nav>

          <div className="site-header__actions">
            <a className="site-header__phone" href={`tel:${PHONE_LINK}`}>
              <span aria-hidden="true">📞</span> {PHONE_DISPLAY}
            </a>
            {!isAdmin && !isBooking && (
              <button
                type="button"
                className="btn btn--accent btn--sm site-header__cta"
                onClick={() => navigate('/reserver')}
              >
                Réserver
              </button>
            )}
          </div>
        </div>
      </header>

      <main className={isHome ? 'page page--home' : 'page container'}>
        {isAdmin ? (
          <AdminPage notify={notify} />
        ) : isBooking ? (
          <BookingPage notify={notify} />
        ) : (
          <HomePage navigate={navigate} phoneDisplay={PHONE_DISPLAY} phoneLink={PHONE_LINK} />
        )}
      </main>

      <footer className="site-footer">
        <div className="container">
          <p>
            Ouvert tous les jours, de 6 h à 2 h · Acompte de 50 % à la réservation,
            solde sur place
          </p>
          <p>
            Une question ? <a href={`tel:${PHONE_LINK}`}>{PHONE_DISPLAY}</a>
          </p>
        </div>
      </footer>

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
