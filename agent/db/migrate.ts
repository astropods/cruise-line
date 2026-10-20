import type { Sql, TransactionSql } from 'postgres';
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

// Any constant works; it just has to be the same for every instance
const MIGRATION_LOCK = 4_242_001;

export async function runMigrations(sql: Sql) {
  // Two instances starting together (a rolling deploy) would otherwise both
  // apply the same migration, and the loser crashes on boot. The second one
  // waits on the lock, then finds nothing left to apply.
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK})`;
    await applyPending(tx);
  });
}

async function applyPending(sql: TransactionSql) {
  // Create migrations tracking table
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Get already-applied migrations
  const applied = await sql<{ name: string }[]>`SELECT name FROM _migrations ORDER BY name`;
  const appliedSet = new Set(applied.map((r) => r.name));

  // Read migration files
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) continue;

    const content = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');
    console.log(`Applying migration: ${file}`);

    await sql.unsafe(content);
    await sql`INSERT INTO _migrations (name) VALUES (${file})`;
  }
}
