import type { Db } from '@agora/db';
import { describe, expect, it } from 'vitest';
import { hashPassword } from '../auth/password';
import { productionProblems } from './production-checks';

const fakeDb = (rows: { username: string; password_hash: string }[]) =>
  ({ query: async () => ({ rows }) }) as unknown as Db;

const good = {
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://agora.exemplo.com.br',
  DATABASE_URL: 'postgres://agora_app:Zx9-forte-longa@db:5432/agora',
  REDIS_URL: 'redis://:segredo@redis:6379',
};

describe('productionProblems', () => {
  it('não bloqueia fora de produção (admin/admin segue valendo em dev)', async () => {
    const db = fakeDb([{ username: 'admin', password_hash: await hashPassword('admin') }]);
    expect(await productionProblems(db, { NODE_ENV: 'development' })).toEqual([]);
  });

  it('recusa senha fraca, inclusive a igual ao usuário', async () => {
    const db = fakeDb([
      { username: 'admin', password_hash: await hashPassword('admin') },
      { username: 'maria', password_hash: await hashPassword('maria') },
      { username: 'joao', password_hash: await hashPassword('Uma-senha-bem-longa-9') },
    ]);
    const p = await productionProblems(db, good);
    expect(p).toHaveLength(2);
    expect(p.join(' ')).toContain('admin');
    expect(p.join(' ')).toContain('maria');
  });

  it('recusa origem sem https, cookie sem Secure, senha padrão do banco e Redis sem senha', async () => {
    const p = await productionProblems(fakeDb([]), {
      NODE_ENV: 'production',
      APP_ORIGIN: 'http://x',
      COOKIE_SECURE: '0',
      DATABASE_URL: 'postgres://agora_app:agora_app@db/agora',
      REDIS_URL: 'redis://redis:6379',
    });
    expect(p).toHaveLength(4);
  });

  it('configuração correta passa limpa', async () => {
    const db = fakeDb([
      { username: 'joao', password_hash: await hashPassword('Uma-senha-bem-longa-9') },
    ]);
    expect(await productionProblems(db, good)).toEqual([]);
  });
});
