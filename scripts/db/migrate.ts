/**
 * Apply the database schema.
 *
 * Usage: DATABASE_URL=postgres://... npm run db:migrate
 *
 * The migration is idempotent (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT
 * EXISTS), so it is safe to run on every deploy. The app also runs it lazily on
 * first use, so this script is for the case where you want the schema applied
 * before any traffic arrives.
 */

import postgres from 'postgres';
import { MIGRATION_SQL } from '../../lib/db/postgres';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;

  if (!url) {
    console.error('DATABASE_URL is not set. Nothing to migrate.');
    console.error('Usage: DATABASE_URL=postgres://... npm run db:migrate');
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });

  try {
    console.log('Applying schema…');
    await sql.unsafe(MIGRATION_SQL);

    const tables = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('licenses', 'audits', 'rate_limits')
      ORDER BY table_name
    `;

    console.log(`Done. Tables present: ${tables.map((t) => t.table_name).join(', ')}`);
  } catch (error) {
    console.error('Migration failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main();
