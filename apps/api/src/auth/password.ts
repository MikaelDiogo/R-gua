import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Hash de senha com scrypt (embutido no Node, memória-intensivo). Formato: scrypt$N$r$p$salt$hash.
 * Parâmetros guardados no próprio hash: dá para aumentar o custo depois sem invalidar senhas antigas.
 */
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;

const derive = (password: string, salt: Buffer, n: number, r: number, p: number) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEYLEN,
      { N: n, r, p, maxmem: 128 * n * r * 2 },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Hash de uma senha qualquer, para gastar o mesmo tempo quando o e-mail não existe (não revela quem tem conta). */
let dummy: Promise<string> | null = null;
export const dummyHash = () => {
  dummy ??= hashPassword('senha-que-ninguem-usa');
  return dummy;
};
