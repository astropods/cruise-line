import postgres from 'postgres';
import { config } from '../config.js';
import { runMigrations } from './migrate.js';

export const sql = postgres(config.db.url, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export async function initDb() {
  const maxRetries = 30;
  const retryDelay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await sql`SELECT 1`;
      break;
    } catch (err) {
      if (attempt === maxRetries) {
        console.error(`Database not reachable after ${maxRetries} attempts, giving up`);
        throw err;
      }
      console.log(`Waiting for database... (attempt ${attempt}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, retryDelay));
    }
  }

  await runMigrations(sql);
  console.log('Database connected and migrations applied');
}
