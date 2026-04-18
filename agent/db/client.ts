import postgres from 'postgres';
import { config } from '../config.js';
import { runMigrations } from './migrate.js';

export const sql = postgres(config.db.url, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export async function initDb() {
  await runMigrations(sql);
  await sql`SELECT 1`;
  console.log('Database connected and migrations applied');
}
