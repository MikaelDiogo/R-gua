import { createHash } from 'node:crypto';
import {
  type AdminUser,
  type AdminUsersResponse,
  CreateUserRequest,
  type CreateUserResponse,
  ResetPasswordRequest,
  type ResetPasswordResponse,
} from '@agora/contracts';
import type { Db } from '@agora/db';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import type { SessionUser } from '../auth/auth.service';
import { hashPassword } from '../auth/password';
import { generatePassword, passwordProblem } from '../auth/password-policy';
import { InjectDb } from '../platform/db.module';
import { DomainError } from '../platform/problem.filter';

interface UserRow {
  id: string;
  username: string;
  name: string | null;
  role: 'admin' | 'user';
  created_at: Date;
  last_login_at: Date | null;
}

const COLUMNS = 'id, username::text AS username, name, role, created_at, last_login_at';

const toAdminUser = (r: UserRow): AdminUser => ({
  id: r.id,
  username: r.username,
  name: r.name,
  role: r.role,
  created_at: r.created_at.toISOString(),
  last_login_at: r.last_login_at?.toISOString() ?? null,
});

const KEY = z.string().uuid();
const ID = z.string().uuid();
const IDEMPOTENCY_TTL_MS = 10 * 60_000;
const IDEMPOTENCY_MAX = 500;

/**
 * Administração de contas. Idempotência (docs/04 §2): a mesma chave com o mesmo corpo devolve a MESMA resposta sem
 * repetir o efeito. A resposta pode conter a senha gerada, que é segredo: por isso o cache vive só na memória do
 * processo, por 10 minutos, e nunca vai ao banco nem ao log.
 */
@Injectable()
export class AdminService {
  private readonly log = new Logger('Admin');
  private readonly replay = new Map<string, { hash: string; response: unknown; at: number }>();

  constructor(@InjectDb() private readonly db: Db) {}

  private async once<T>(
    admin: SessionUser,
    key: string | undefined,
    body: unknown,
    run: () => Promise<T>,
  ): Promise<T> {
    const parsed = KEY.safeParse(key);
    if (!parsed.success)
      throw new DomainError('validation_failed', 'Cabeçalho Idempotency-Key (UUID) é obrigatório');
    const now = Date.now();
    for (const [k, v] of this.replay) if (v.at < now - IDEMPOTENCY_TTL_MS) this.replay.delete(k);
    const id = `${admin.id}:${parsed.data}`;
    const hash = createHash('sha256')
      .update(JSON.stringify(body ?? null))
      .digest('hex');
    const hit = this.replay.get(id);
    if (hit) {
      if (hit.hash !== hash)
        throw new DomainError(
          'idempotency_mismatch',
          'A mesma Idempotency-Key foi usada com outro corpo',
        );
      return hit.response as T;
    }
    const response = await run();
    if (this.replay.size >= IDEMPOTENCY_MAX)
      this.replay.delete(this.replay.keys().next().value as string);
    this.replay.set(id, { hash, response, at: now });
    return response;
  }

  async list(): Promise<AdminUsersResponse> {
    const r = await this.db.query<UserRow>(
      `SELECT ${COLUMNS} FROM users ORDER BY created_at, username`,
    );
    return { items: r.rows.map(toAdminUser) };
  }

  async create(
    admin: SessionUser,
    key: string | undefined,
    raw: unknown,
  ): Promise<CreateUserResponse> {
    const req = CreateUserRequest.parse(raw ?? {});
    return this.once(admin, key, req, async () => {
      if (req.password) {
        const problem = passwordProblem(req.password, req.username);
        if (problem) throw new DomainError('validation_failed', problem);
      }
      const generated = req.password ? null : generatePassword();
      try {
        const r = await this.db.query<UserRow>(
          `INSERT INTO users (username, password_hash, name, role) VALUES ($1,$2,$3,$4) RETURNING ${COLUMNS}`,
          [
            req.username,
            await hashPassword(req.password ?? (generated as string)),
            req.name ?? null,
            req.role,
          ],
        );
        this.log.log(`${admin.username} criou a conta ${req.username} (${req.role})`);
        return { user: toAdminUser(r.rows[0] as UserRow), generated_password: generated };
      } catch (e) {
        if (typeof e === 'object' && e && 'code' in e && e.code === '23505')
          throw new DomainError('conflict', `O usuário "${req.username}" já existe.`);
        throw e;
      }
    });
  }

  async resetPassword(
    admin: SessionUser,
    key: string | undefined,
    id: string,
    raw: unknown,
  ): Promise<ResetPasswordResponse> {
    const targetId = ID.parse(id);
    const req = ResetPasswordRequest.parse(raw ?? {});
    return this.once(admin, key, { id: targetId, ...req }, async () => {
      const found = await this.db.query<{ username: string }>(
        'SELECT username::text AS username FROM users WHERE id = $1',
        [targetId],
      );
      const target = found.rows[0];
      if (!target) throw new DomainError('not_found', 'Usuário não encontrado.');
      if (req.password) {
        const problem = passwordProblem(req.password, target.username);
        if (problem) throw new DomainError('validation_failed', problem);
      }
      const generated = req.password ? null : generatePassword();
      await this.db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [
        targetId,
        await hashPassword(req.password ?? (generated as string)),
      ]);
      await this.db.query('DELETE FROM sessions WHERE user_id = $1', [targetId]); // derruba as sessões abertas
      this.log.log(`${admin.username} trocou a senha de ${target.username} e encerrou as sessões`);
      return { generated_password: generated };
    });
  }

  async remove(admin: SessionUser, key: string | undefined, id: string): Promise<void> {
    const targetId = ID.parse(id);
    await this.once(admin, key, { id: targetId }, async () => {
      if (targetId === admin.id)
        throw new DomainError('validation_failed', 'Você não pode excluir a própria conta.');
      // Atômico: o último administrador nunca sai, mesmo com duas exclusões ao mesmo tempo.
      const r = await this.db.query<{ username: string }>(
        `DELETE FROM users WHERE id = $1
           AND (role <> 'admin' OR (SELECT count(*) FROM users WHERE role = 'admin') > 1)
         RETURNING username::text AS username`,
        [targetId],
      );
      if (r.rowCount === 0) {
        const exists = await this.db.query('SELECT 1 FROM users WHERE id = $1', [targetId]);
        if (exists.rowCount === 0) throw new DomainError('not_found', 'Usuário não encontrado.');
        throw new DomainError('conflict', 'Este é o último administrador e não pode ser excluído.');
      }
      this.log.log(`${admin.username} excluiu a conta ${r.rows[0]?.username}`);
      return null;
    });
  }
}
