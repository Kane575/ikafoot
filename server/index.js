import app from './app.js';
import { pool } from './db.js';

/**
 * Démarrage « serveur classique » : local, Docker, Render, Cloud Run, VPS.
 * L'hébergeur impose le port par la variable PORT ; 3002 est le repli local.
 */
const port = Number(process.env.PORT) || 3002;

const server = app.listen(port, () => {
  console.log(`IKAFOOT — API sur http://localhost:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
