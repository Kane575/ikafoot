import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import { pool } from './db.js';
import { HttpError } from './lib/validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const app = express();
const port = Number(process.env.PORT) || 3002;
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1); // Render/Railway placent un reverse-proxy devant l'app
app.disable('x-powered-by');

// En développement le front tourne sur Vite (port 5173) : il faut autoriser
// explicitement l'origine et les cookies. En production tout est servi ici,
// donc aucune requête cross-origin n'est nécessaire.
if (!isProduction) {
  app.use(
    cors({
      origin: ['http://localhost:4173', 'http://127.0.0.1:4173'],
      credentials: true,
    })
  );
}

app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'up' });
  } catch (error) {
    res.status(503).json({ status: 'degraded', database: 'down', message: error.message });
  }
});

app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Route introuvable.' });
});

// En production, le même service sert le front buildé : une seule URL, un seul déploiement.
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { maxAge: '1h', index: false }));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else if (isProduction) {
  console.warn('Le dossier dist/ est absent : lancez `npm run build` avant `npm start`.');
}

// Gestionnaire d'erreurs : les HttpError deviennent des réponses métier lisibles,
// tout le reste devient un 500 générique (aucun détail interne exposé au client).
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error instanceof HttpError) {
    return res.status(error.status).json({ message: error.message });
  }

  // Corps de requête illisible : c'est une faute du client, pas du serveur.
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Requête mal formée.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Requête trop volumineuse.' });
  }

  console.error(`${req.method} ${req.originalUrl} —`, error);
  res.status(500).json({ message: 'Une erreur est survenue côté serveur.' });
});

const server = app.listen(port, () => {
  console.log(`IKAFOOT — API sur http://localhost:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
