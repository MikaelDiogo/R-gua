import { randomBytes } from 'node:crypto';
import { PASSWORD_MIN } from '@agora/contracts';

/** Senhas que nunca valem, além do próprio nome de usuário (docs/10; production-checks e /admin usam a mesma lista). */
export const WEAK_PASSWORDS = [
  'admin',
  'password',
  'senha',
  '123456',
  '12345678',
  'agora',
  'agora123',
  'regua',
  'regua123',
  'changeme',
];

/** Texto do problema ou null se a senha serve. O tamanho mínimo é conferido pelo contrato; aqui entram as regras de conteúdo. */
export function passwordProblem(password: string, username: string): string | null {
  if (password.length < PASSWORD_MIN)
    return `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`;
  const lower = password.toLowerCase();
  if (lower === username || lower.includes(username))
    return 'A senha não pode conter o nome de usuário.';
  if (WEAK_PASSWORDS.includes(lower)) return 'Essa senha é fraca demais. Escolha outra.';
  return null;
}

/** Senha aleatória forte e fácil de digitar (sem caracteres ambíguos). */
export function generatePassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(18);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out.slice(0, 6)}-${out.slice(6, 12)}-${out.slice(12, 18)}`;
}
