import type { Db } from '@agora/db';
import { verifyPassword } from '../auth/password';
import { WEAK_PASSWORDS } from '../auth/password-policy';

/**
 * Recusa subir em produção com configuração insegura (docs/04, docs/16 §4). Devolve a lista de problemas;
 * vazia quer dizer que pode subir. Fora de produção não bloqueia nada.
 */
export async function productionProblems(db: Db, env = process.env): Promise<string[]> {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];

  if (!env.APP_ORIGIN?.startsWith('https://'))
    problems.push('APP_ORIGIN precisa ser o endereço https:// do site (usado contra CSRF).');
  if (env.COOKIE_SECURE === '0') problems.push('COOKIE_SECURE=0 não é permitido em produção.');
  const dbUrl = env.DATABASE_URL ?? '';
  if (/:(agora_app|postgres|password|admin)@/.test(dbUrl))
    problems.push('DATABASE_URL usa a senha padrão de desenvolvimento.');
  if (/redis:\/\/(?!.*:.+@)/.test(env.REDIS_URL ?? ''))
    problems.push('REDIS_URL sem senha: configure REDIS_PASSWORD.');

  const users = await db.query<{ username: string; password_hash: string }>(
    'SELECT username::text AS username, password_hash FROM users',
  );
  for (const u of users.rows) {
    for (const weak of [...WEAK_PASSWORDS, u.username]) {
      if (await verifyPassword(weak, u.password_hash)) {
        problems.push(
          `O usuário "${u.username}" tem senha fraca. Troque: pnpm --filter @agora/api user reset ${u.username}`,
        );
        break;
      }
    }
  }
  return problems;
}
