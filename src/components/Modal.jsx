import { useEffect, useRef } from 'react';

export default function Modal({ title, subtitle, onClose, children }) {
  const cardRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Au montage uniquement. `onClose` est une fonction fléchée recréée à chaque
  // rendu : la mettre en dépendance relancerait cet effet à chaque frappe, et
  // le focus repartirait sur la croix de fermeture au milieu de la saisie.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeRef.current();
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    // Le premier champ à remplir, pas le premier élément focusable du DOM.
    cardRef.current?.querySelector('input, select, textarea')?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={() => closeRef.current()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={cardRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal__head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="modal__subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
