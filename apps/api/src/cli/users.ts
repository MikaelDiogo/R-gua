import { PASSWORD_MIN, USERNAME_RE } from '@agora/contracts';
import { createPool } from '@agora/db';
import { hashPassword } from '../auth/password';
import { generatePassword } from '../auth/password-policy';

/**
 * Administração de contas (sistema fechado: não há cadastro público). Uso:
 *   pnpm --filter @agora/api user create <usuario> [--name "Nome"] [--admin] [--password-env VAR]
 *   pnpm --filter @agora/api user reset <usuario> [--password-env VAR]
 *   pnpm --filter @agora/api user list
 *   pnpm --filter @agora/api user delete <usuario>
 * Sem --password-env a senha é gerada, mostrada UMA vez e nunca guardada em claro.
 */
function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function resolvePassword(): { password: string; generated: boolean } {
  const envName = flag('password-env');
  if (envName) {
    const p = process.env[envName];
    if (!p || p.length < PASSWORD_MIN)
      throw new Error(`A variável ${envName} precisa ter pelo menos ${PASSWORD_MIN} caracteres.`);
    return { password: p, generated: false };
  }
  return { password: generatePassword(), generated: true };
}

async function main() {
  const [cmd, rawUser] = process.argv.slice(2);
  const db = createPool('app');
  try {
    if (cmd === 'list') {
      const r = await db.query<{
        username: string;
        name: string | null;
        role: string;
        created_at: Date;
      }>(
        'SELECT username::text AS username, name, role, created_at FROM users ORDER BY created_at',
      );
      for (const u of r.rows)
        console.log(
          `${u.username.padEnd(24)} ${u.role.padEnd(6)} ${(u.name ?? '').padEnd(24)} ${u.created_at.toISOString().slice(0, 10)}`,
        );
      if (r.rows.length === 0) console.log('(nenhum usuário)');
      return;
    }
    const username = (rawUser ?? '').trim().toLowerCase();
    if (!USERNAME_RE.test(username))
      throw new Error(
        'Informe um usuário válido: 3 a 32 caracteres (minúsculas, números, ponto, hífen e sublinhado).',
      );

    if (cmd === 'create') {
      const { password, generated } = resolvePassword();
      try {
        await db.query(
          'INSERT INTO users (username, password_hash, name, role) VALUES ($1,$2,$3,$4)',
          [
            username,
            await hashPassword(password),
            flag('name') ?? null,
            process.argv.includes('--admin') ? 'admin' : 'user',
          ],
        );
      } catch (e) {
        if (typeof e === 'object' && e && 'code' in e && e.code === '23505')
          throw new Error(`O usuário "${username}" já existe. Use "reset" para trocar a senha.`);
        throw e;
      }
      console.log(`Usuário criado: ${username}`);
      if (generated) console.log(`Senha (mostrada só agora): ${password}`);
    } else if (cmd === 'reset') {
      const { password, generated } = resolvePassword();
      const r = await db.query('UPDATE users SET password_hash = $2 WHERE username = $1', [
        username,
        await hashPassword(password),
      ]);
      if (r.rowCount === 0) throw new Error(`Usuário "${username}" não encontrado.`);
      await db.query(
        'DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = $1)',
        [username],
      ); // derruba sessões abertas
      console.log(`Senha trocada e sessões encerradas: ${username}`);
      if (generated) console.log(`Nova senha (mostrada só agora): ${password}`);
    } else if (cmd === 'delete') {
      const r = await db.query('DELETE FROM users WHERE username = $1', [username]);
      console.log(
        r.rowCount
          ? `Usuário removido (com pipeline, propostas e perfil): ${username}`
          : `Usuário "${username}" não encontrado.`,
      );
    } else {
      throw new Error('Comando desconhecido. Use: create | reset | list | delete');
    }
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
