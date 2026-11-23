import { describe, expect, it } from 'vitest';
import { readCookie } from './auth.guard';
import { hashPassword, verifyPassword } from './password';

describe('senha (scrypt)', () => {
  it('confere a senha certa e recusa a errada', async () => {
    const h = await hashPassword('uma senha bem longa 123');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('uma senha bem longa 123', h)).toBe(true);
    expect(await verifyPassword('outra senha qualquer', h)).toBe(false);
  });
  it('cada hash tem sal próprio e o texto da senha não aparece nele', async () => {
    const [a, b] = await Promise.all([
      hashPassword('mesma-senha-123456'),
      hashPassword('mesma-senha-123456'),
    ]);
    expect(a).not.toBe(b);
    expect(a).not.toContain('mesma-senha');
  });
  it('hash malformado nunca autentica', async () => {
    expect(await verifyPassword('x', 'lixo')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$1$2$3$')).toBe(false);
  });
});

describe('readCookie', () => {
  it('lê o cookie certo entre vários', () => {
    expect(readCookie('a=1; regua_session=abc%2Fdef; b=2', 'regua_session')).toBe('abc/def');
    expect(readCookie(undefined, 'regua_session')).toBeUndefined();
    expect(readCookie('xregua_session=1', 'regua_session')).toBeUndefined();
  });
});
