import app from '../server/app.js';

/**
 * Point d'entrée Vercel : toute requête /api/* y est renvoyée par la règle de
 * réécriture de `vercel.json`.
 *
 * Une application Express est déjà une fonction (req, res) : on l'exporte telle
 * quelle. C'est le même objet que celui écouté par `server/index.js` ailleurs.
 */
export default app;
