import { z } from 'zod';
import { ALLOWED_UFS } from './common';

/** Senha: tamanho mínimo e máximo (o máximo evita DoS no hash). Sem regra de composição: comprimento vale mais (NIST 800-63B). */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** Usuário: 3 a 32 caracteres, minúsculas, números, ponto, hífen e sublinhado; começa com letra ou número. */
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const username = z.string().trim().toLowerCase().regex(USERNAME_RE, 'Usuário inválido');

/** Sistema fechado: não há cadastro público. As contas são criadas pelo administrador (linha de comando). */
export const LoginRequest = z
  .object({ username, password: z.string().min(1).max(PASSWORD_MAX) })
  .strict();
export type LoginRequest = z.infer<typeof LoginRequest>;

/** Papel da conta. `admin` cria e administra contas em /admin; o servidor lê o papel do banco, nunca do cliente. */
export const UserRole = z.enum(['admin', 'user']);
export type UserRole = z.infer<typeof UserRole>;

export const MeResponse = z.object({
  user: z.object({
    id: z.string().uuid(),
    username: z.string(),
    name: z.string().nullable(),
    role: UserRole,
  }),
  /** Estados cobertos pelo produto. O servidor aplica este limite em toda consulta. */
  allowed_ufs: z.array(z.enum(ALLOWED_UFS)),
  server_now: z.string().datetime(),
});
export type MeResponse = z.infer<typeof MeResponse>;

/** Troca de senha pelo próprio usuário. A identidade vem da sessão, nunca do corpo (docs/04). */
export const ChangePasswordRequest = z
  .object({
    current_password: z.string().min(1).max(PASSWORD_MAX),
    new_password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
  })
  .strict();
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>;
