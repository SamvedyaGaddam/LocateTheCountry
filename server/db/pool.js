import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Enable TLS only when your deployment provider requires it.
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});
