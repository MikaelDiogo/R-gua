import { Pool, type PoolClient } from 'pg';

export type Db = Pool;

/** Papéis separados (docs/07 §7): `app` sem BYPASSRLS, `migrator` dono das tabelas, `worker` para a ingestão. */
export function createPool(kind: 'app' | 'migrator' | 'worker' = 'app'): Db {
  const url =
    kind === 'app'
      ? process.env.DATABASE_URL
      : kind === 'migrator'
        ? process.env.MIGRATOR_DATABASE_URL
        : (process.env.WORKER_DATABASE_URL ?? process.env.DATABASE_URL);
  if (!url) throw new Error(`variável de conexão do banco ausente para o papel "${kind}"`);
  const pool = new Pool({
    connectionString: url,
    max: kind === 'app' ? 10 : 4,
    // Banco que reinicia ou dorme (plano gratuito) derruba conexões paradas: o pool as descarta e reabre.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    // Consulta presa não segura conexão para sempre (migrations usam outro papel e não têm limite).
    ...(kind === 'migrator' ? {} : { statement_timeout: 60_000 }),
  });
  // Sem este ouvinte, uma conexão ociosa que cai vira exceção não tratada e derruba o processo inteiro.
  pool.on('error', (e) => console.error('[db] conexão ociosa caiu e será reaberta:', e.message));
  return pool;
}

/**
 * Transação escopada pelo usuário: `SET LOCAL app.user_id` (docs/07 §7). Com PgBouncer em modo transação
 * é a única forma segura; o `set_config(..., true)` vale só até o fim desta transação.
 */
export async function withUser<T>(
  db: Db,
  userId: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
