import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './pool';

const DIR = join(__dirname, '..', 'migrations');

/** Aplica, em ordem, as migrations ainda não registradas. Cada arquivo roda numa transação. */
export async function migrate(db: Db, log: (m: string) => void = console.log): Promise<string[]> {
  await db.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const done = new Set(
    (await db.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(
      (r) => r.name,
    ),
  );
  const applied: string[] = [];
  for (const file of readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    if (done.has(file)) continue;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(readFileSync(join(DIR, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      log(`migration aplicada: ${file}`);
      applied.push(file);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new Error(`falha em ${file}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      client.release();
    }
  }
  if (applied.length === 0) log('nada a migrar');
  return applied;
}
