import { z } from 'zod';
import { PASSWORD_MAX, PASSWORD_MIN, UserRole, username } from './auth';

/** Administração de contas (sistema fechado, sem cadastro público). Só o papel `admin` acessa (docs/04). */
export const AdminUser = z.object({
  id: z.string().uuid(),
  username: z.string(),
  name: z.string().nullable(),
  role: UserRole,
  created_at: z.string().datetime(),
  last_login_at: z.string().datetime().nullable(),
});
export type AdminUser = z.infer<typeof AdminUser>;

export const AdminUsersResponse = z.object({ items: z.array(AdminUser) });
export type AdminUsersResponse = z.infer<typeof AdminUsersResponse>;

const optionalPassword = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX).optional();

/** Sem `password`, o servidor gera uma senha forte e a devolve UMA vez. */
export const CreateUserRequest = z
  .object({
    username,
    name: z.string().trim().min(1).max(80).optional(),
    role: UserRole.default('user'),
    password: optionalPassword,
  })
  .strict();
export type CreateUserRequest = z.infer<typeof CreateUserRequest>;

export const CreateUserResponse = z.object({
  user: AdminUser,
  generated_password: z.string().nullable(),
});
export type CreateUserResponse = z.infer<typeof CreateUserResponse>;

export const ResetPasswordRequest = z.object({ password: optionalPassword }).strict();
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequest>;

export const ResetPasswordResponse = z.object({ generated_password: z.string().nullable() });
export type ResetPasswordResponse = z.infer<typeof ResetPasswordResponse>;
