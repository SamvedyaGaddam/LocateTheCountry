
import fs from 'node:fs/promises';
import { pool } from '../server/db/pool.js';

const schema = await fs.readFile(
  new URL('../server/db/schema.sql', import.meta.url),
  'utf8'
);

try {
  await pool.query(schema);
  console.log('GeoQuest database tables are ready.');
} catch (error) {
  console.error('Database setup failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
