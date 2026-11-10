import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import gameRoutes from './routes/gameRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import { pool } from './db/pool.js';
import { getCountryIndex } from './services/countryService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use(express.static(path.resolve(__dirname, '../public')));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, service: 'GeoQuest API', database: 'connected' });
  } catch {
    res.status(503).json({ success: false, service: 'GeoQuest API', database: 'unavailable' });
  }
});
app.get('/api/regions', async (_req, res, next) => {
  try {
    const countries = await getCountryIndex();
    const regionCounts = new Map();
    for (const country of countries) {
      regionCounts.set(country.region, (regionCounts.get(country.region) || 0) + 1);
    }
    const regions = [...regionCounts.entries()]
      .filter(([, count]) => count >= 10)
      .map(([region]) => region)
      .sort();
    res.json({ success: true, regions });
  } catch (error) {
    next(error);
  }
});
app.use('/api/games', gameRoutes);
app.use('/api/analytics', analyticsRoutes);

app.use((req, res) => res.status(404).json({ success: false, error: 'Route not found' }));
app.use((error, _req, res, _next) => {
  console.error('[GeoQuest API]', error);
  const status = error.status || (error.name === 'ZodError' ? 400 : 500);
  const message = status >= 500
    ? (process.env.NODE_ENV === 'development' ? error.message : 'Internal server error')
    : error.message;
  res.status(status).json({
    success: false,
    error: message,
    ...(error.name === 'ZodError' ? { details: error.issues } : {}),
  });
});

const server = app.listen(PORT, async () => {
  console.log(`GeoQuest running at http://localhost:${PORT}`);
  try { await getCountryIndex(); console.log('Country metadata loaded.'); }
  catch (error) { console.warn('Country data is not ready:', error.message); }
});

async function shutdown() {
  server.close(async () => { await pool.end(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
