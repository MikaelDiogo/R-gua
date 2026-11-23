import { CreateUserRequest, ResetPasswordRequest } from '@agora/contracts';
import type { Db } from '@agora/db';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { SessionUser } from '../auth/auth.service';
import { verifyPassword } from '../auth/password';
import { passwordProblem } from '../auth/password-policy';
import { DomainError } from '../platform/problem.filter';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

interface U {
  id: string;
  username: string;
  name: string | null;
  role: 'admin' | 'user';
  password_hash: string;
  created_at: Date;
  last_login_at: Date | null;
}

/** Banco em memória que entende só as consultas do AdminService (casa pelo texto do SQL). */
function fakeDb() {
  const users: U[] = [];
  const sessions: { user_id: string }[] = [];
  let seq = 0;
  const query = async (sql: string, p: unknown[] = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('INSERT INTO users')) {
      const [username, hash, name, role] = p as [string, string, string | null, 'admin' | 'user'];
      if (users.some((u) => u.username === username))
        throw Object.assign(new Error('duplicate'), { code: '23505' });
      const u: U = {
        id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
        username,
        name,
        role,
        password_hash: hash,
        created_at: new Date(),
        last_login_at: null,
      };
      users.push(u);
      return { rows: [u], rowCount: 1 };
    }
    if (s.startsWith('SELECT id, username')) return { rows: users, rowCount: users.length };
    if (s.startsWith('SELECT username::text AS username FROM users WHERE id')) {
      const u = users.find((x) => x.id === p[0]);
      return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
    }
    if (s.startsWith('UPDATE users SET password_hash')) {
      const u = users.find((x) => x.id === p[0]);
      if (u) u.password_hash = p[1] as string;
      return { rows: [], rowCount: u ? 1 : 0 };
    }
    if (s.startsWith('DELETE FROM sessions WHERE user_id')) {
      for (let i = sessions.length - 1; i >= 0; i--)
        if (sessions[i]?.user_id === p[0]) sessions.splice(i, 1);
      return { rows: [], rowCount: 0 };
    }
    if (s.startsWith('DELETE FROM users WHERE id')) {
      const i = users.findIndex((x) => x.id === p[0]);
      const u = users[i];
      const admins = users.filter((x) => x.role === 'admin').length;
      if (!u || (u.role === 'admin' && admins <= 1)) return { rows: [], rowCount: 0 };
      users.splice(i, 1);
      return { rows: [u], rowCount: 1 };
    }
    if (s.startsWith('SELECT 1 FROM users WHERE id')) {
      const n = users.filter((x) => x.id === p[0]).length;
      return { rows: [], rowCount: n };
    }
    throw new Error(`consulta não prevista no teste: ${s.slice(0, 60)}`);
  };
  return { db: { query } as unknown as Db, users, sessions };
}

const key = () => crypto.randomUUID();
const admin = (id = 'a0000000-0000-4000-8000-000000000000'): SessionUser => ({
  id,
  username: 'chefe',
  name: null,
  role: 'admin',
});

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    return `outro:${e instanceof Error ? e.constructor.name : typeof e}`;
  }
  return 'ok';
}

describe('AdminGuard', () => {
  const ctx = (user?: Pick<SessionUser, 'role'>) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;
  it('deixa só o administrador passar e dá 403 aos demais', () => {
    const g = new AdminGuard();
    expect(g.canActivate(ctx({ role: 'admin' }))).toBe(true);
    expect(() => g.canActivate(ctx({ role: 'user' }))).toThrow(DomainError);
    expect(() => g.canActivate(ctx(undefined))).toThrow(DomainError);
    try {
      g.canActivate(ctx({ role: 'user' }));
    } catch (e) {
      expect((e as DomainError).code).toBe('forbidden');
    }
  });
});

describe('contratos de administração', () => {
  it('rejeitam campo extra (identidade nunca vem do corpo) e aplicam o papel padrão', () => {
    expect(CreateUserRequest.safeParse({ username: 'maria', org_id: 'x' }).success).toBe(false);
    expect(CreateUserRequest.safeParse({ username: 'Maria!' }).success).toBe(false);
    expect(CreateUserRequest.parse({ username: 'maria' }).role).toBe('user');
    expect(CreateUserRequest.safeParse({ username: 'maria', password: 'curta' }).success).toBe(
      false,
    );
    expect(ResetPasswordRequest.safeParse({ role: 'admin' }).success).toBe(false);
  });
});

describe('política de senha', () => {
  it('recusa fraca, curta e com o nome de usuário', () => {
    expect(passwordProblem('admin', 'maria')).toBeTruthy();
    expect(passwordProblem('maria-forte-123', 'maria')).toBeTruthy();
    expect(passwordProblem('curta', 'maria')).toBeTruthy();
    expect(passwordProblem('Uma-senha-bem-longa-9', 'maria')).toBeNull();
  });
});

describe('AdminService', () => {
  it('cria conta com senha gerada, devolvida uma vez, e guarda só o hash', async () => {
    const { db, users } = fakeDb();
    const svc = new AdminService(db);
    const r = await svc.create(admin(), key(), { username: 'maria', name: 'Maria' });
    expect(r.user.username).toBe('maria');
    expect(r.user.role).toBe('user');
    expect(r.generated_password).toMatch(/^[A-Za-z0-9]{6}-[A-Za-z0-9]{6}-[A-Za-z0-9]{6}$/);
    expect(users[0]?.password_hash).not.toContain(r.generated_password as string);
    expect(
      await verifyPassword(r.generated_password as string, users[0]?.password_hash ?? ''),
    ).toBe(true);
    expect(JSON.stringify(r)).not.toContain('password_hash');
  });

  it('com senha própria não gera outra', async () => {
    const { db } = fakeDb();
    const r = await new AdminService(db).create(admin(), key(), {
      username: 'joao',
      password: 'Uma-senha-bem-longa-9',
    });
    expect(r.generated_password).toBeNull();
  });

  it('usuário repetido dá conflito (409) e senha fraca dá 422', async () => {
    const { db } = fakeDb();
    const svc = new AdminService(db);
    await svc.create(admin(), key(), { username: 'maria' });
    expect(await code(svc.create(admin(), key(), { username: 'maria' }))).toBe('conflict');
    expect(
      await code(svc.create(admin(), key(), { username: 'pedro', password: 'password1234' })),
    ).toBe('ok'); // não está na lista exata; o tamanho mínimo é do contrato
    expect(
      await code(svc.create(admin(), key(), { username: 'ana', password: 'ana-ana-ana-ana' })),
    ).toBe('validation_failed');
  });

  it('campo extra é rejeitado e Idempotency-Key é obrigatória', async () => {
    const { db } = fakeDb();
    const svc = new AdminService(db);
    expect(
      await code(svc.create(admin(), key(), { username: 'maria', role: 'user', org_id: 'x' })),
    ).toMatch(/^outro:ZodError/);
    expect(await code(svc.create(admin(), undefined, { username: 'maria' }))).toBe(
      'validation_failed',
    );
    expect(await code(svc.create(admin(), 'nao-e-uuid', { username: 'maria' }))).toBe(
      'validation_failed',
    );
  });

  it('a mesma chave com o mesmo corpo é um efeito só; com outro corpo é idempotency_mismatch', async () => {
    const { db, users } = fakeDb();
    const svc = new AdminService(db);
    const k = key();
    const a = await svc.create(admin(), k, { username: 'maria' });
    const b = await svc.create(admin(), k, { username: 'maria' });
    expect(b).toEqual(a);
    expect(users).toHaveLength(1);
    expect(await code(svc.create(admin(), k, { username: 'outra' }))).toBe('idempotency_mismatch');
  });

  it('troca a senha e encerra as sessões do alvo', async () => {
    const { db, users, sessions } = fakeDb();
    const svc = new AdminService(db);
    const c = await svc.create(admin(), key(), { username: 'maria' });
    sessions.push({ user_id: c.user.id }, { user_id: c.user.id }, { user_id: 'outro' });
    const r = await svc.resetPassword(admin(), key(), c.user.id, {});
    expect(r.generated_password).toBeTruthy();
    expect(r.generated_password).not.toBe(c.generated_password);
    expect(sessions).toEqual([{ user_id: 'outro' }]);
    expect(
      await verifyPassword(r.generated_password as string, users[0]?.password_hash ?? ''),
    ).toBe(true);
    expect(await code(svc.resetPassword(admin(), key(), 'nao-uuid', {}))).toMatch(
      /^outro:ZodError/,
    );
    expect(
      await code(svc.resetPassword(admin(), key(), '00000000-0000-4000-8000-0000000000ff', {})),
    ).toBe('not_found');
  });

  it('não exclui a si mesmo nem o último administrador', async () => {
    const { db, users } = fakeDb();
    const svc = new AdminService(db);
    const boss = await svc.create(admin(), key(), { username: 'chefe2', role: 'admin' });
    const maria = await svc.create(admin(), key(), { username: 'maria' });
    // a si mesmo
    expect(await code(svc.remove({ ...admin(boss.user.id) }, key(), boss.user.id))).toBe(
      'validation_failed',
    );
    // o último administrador (outro admin tenta; só existe o 'chefe2')
    expect(await code(svc.remove(admin(), key(), boss.user.id))).toBe('conflict');
    // usuário comum sai
    expect(await code(svc.remove(admin(), key(), maria.user.id))).toBe('ok');
    expect(users.map((u) => u.username)).toEqual(['chefe2']);
    expect(await code(svc.remove(admin(), key(), maria.user.id))).toBe('not_found');
  });

  it('com dois administradores um deles pode ser excluído', async () => {
    const { db, users } = fakeDb();
    const svc = new AdminService(db);
    const a1 = await svc.create(admin(), key(), { username: 'adm1', role: 'admin' });
    await svc.create(admin(), key(), { username: 'adm2', role: 'admin' });
    expect(await code(svc.remove(admin(), key(), a1.user.id))).toBe('ok');
    expect(users).toHaveLength(1);
  });

  it('lista sem expor hash de senha', async () => {
    const { db } = fakeDb();
    const svc = new AdminService(db);
    await svc.create(admin(), key(), { username: 'maria' });
    const l = await svc.list();
    expect(l.items).toHaveLength(1);
    expect(JSON.stringify(l)).not.toContain('scrypt');
  });
});
