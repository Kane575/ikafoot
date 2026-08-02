import { useEffect } from 'react';

/**
 * Retour visible après chaque action. Il vit en dehors de la modale : c'est le
 * bug de la version précédente, où le message était affiché dans une modale
 * qu'on venait de fermer, donc jamais lu.
 */
export default function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(onDismiss, toast.type === 'error' ? 7000 : 5000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className={`toast toast--${toast.type}`} role="status" aria-live="polite">
      <p>{toast.message}</p>
      <button type="button" onClick={onDismiss} aria-label="Fermer le message">
        &times;
      </button>
    </div>
  );
}
