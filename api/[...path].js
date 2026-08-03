import app from '../server/app.js';

/**
 * Point d'entrée Vercel.
 *
 * Le nom du fichier est un « catch-all » : Vercel y envoie tout ce qui commence
 * par /api, en conservant l'URL d'origine (/api/slots, /api/admin/login…).
 * Express retrouve donc ses routes sans qu'aucune réécriture soit nécessaire.
 *
 * Une application Express est déjà une fonction (req, res) : on l'exporte telle
 * quelle. C'est le même objet que celui écouté par `server/index.js` ailleurs.
 */
export default app;
