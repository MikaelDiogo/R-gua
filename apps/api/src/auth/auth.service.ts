import { createHash, randomBytes } from 'node:crypto';
import type { ChangePasswordRequest, LoginRequest, MeResponse, UserRole } from '@agora/contracts';
import { ALLOWED_UFS } from '@agora/contracts';
import type { Db } from '@agora/db';
import { Injectable } from '@nestjs/common';
import { type Clock, InjectClock, InjectDb } from '../platform/db.module';
import { DomainError } from '../platform/problem.filter';
import { dummyHash, hashPassword, verifyPassword } from './password';

export const SESSION_COOKIE = 'regua_session';
const SESSION_DAYS = 14;
/** Só renova a sessão (e grava no banco) se passou mais que isso desde a última renovação. */
const RENEW_AFTER_MS = 60 * 60_000;

export interface SessionUser {
  id: string;
  username: string;
  name: string | null;
  /** Lido do banco a cada requisição (validate): nunca vem do cliente. */
  role: UserRole;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Tentativas falhas de login por usuário (em memória; vale por processo). Bloqueia por 15 minutos após 5 falhas. */
const FAIL_WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 5;
const fails = new Map<string, number[]>();

function checkLoginRate(key: string, now: number) {
  const list = (fails.get(key) ?? []).filter((t) => t > now - FAIL_WINDOW_MS);
  fails.set(key, list);
  if (list.length >= MAX_FAILS) {
    throw new DomainError(
      'quota_exceeded',
      'Muitas tentativas de entrada. Aguarde 15 minutos e tente de novo.',
    );
  }
}

@Injectable()
export class AuthService {
  constructor(
    @InjectDb() private readonly db: Db,
    @InjectClock() private readonly clock: Clock,
  ) {}

  me(user: SessionUser): MeResponse {
    return {
      user: { id: user.id, username: user.username, name: user.name, role: user.role },
      allowed_ufs: [...ALLOWED_UFS],
      server_now: this.clock().toISOString(),
    };
  }

  private async newSession(userId: string, userAgent: string | undefined) {
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(this.clock().getTime() + SESSION_DAYS * 86_400_000);
    await this.db.query(
      'INSERT INTO sessions (user_id, token_hash, expires_at, user_agent) VALUES ($1,$2,$3,$4)',
      [userId, sha256(token), expires, userAgent?.slice(0, 300) ?? null],
    );
    return { token, maxAgeSeconds: SESSION_DAYS * 86_400 };
  }

  async login(req: LoginRequest, userAgent?: string) {
    checkLoginRate(req.username, this.clock().getTime());
    const r = await this.db.query<SessionUser & { password_hash: string }>(
      'SELECT id, username::text AS username, name, role, password_hash FROM users WHERE username = $1',
      [req.username],
    );
    const row = r.rows[0];
    // Mesmo custo com ou sem conta, e a mesma mensagem: não revela quais usuários existem.
    const ok = await verifyPassword(req.password, row?.password_hash ?? (await dummyHash()));
    if (!row || !ok) {
      const list = fails.get(req.username) ?? [];
      list.push(this.clock().getTime());
      fails.set(req.username, list);
      throw new DomainError('unauthenticated', 'Usuário ou senha incorretos.');
    }
    fails.delete(req.username);
    // Higiene: sessões vencidas deste usuário saem da tabela.
    await this.db.query('DELETE FROM sessions WHERE user_id = $1 AND expires_at <= now()', [
      row.id,
    ]);
    const user: SessionUser = {
      id: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
    };
    await this.db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [row.id]);
    return { user, ...(await this.newSession(user.id, userAgent)) };
  }

  async changePassword(
    userId: string,
    username: string,
    req: ChangePasswordRequest,
    currentToken: string | undefined,
  ) {
    // Conta como tentativa: quem roubou uma sessão não pode adivinhar a senha atual sem limite.
    checkLoginRate(username, this.clock().getTime());
    const r = await this.db.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId],
    );
    if (!r.rows[0] || !(await verifyPassword(req.current_password, r.rows[0].password_hash))) {
      const list = fails.get(username) ?? [];
      list.push(this.clock().getTime());
      fails.set(username, list);
      throw new DomainError('validation_failed', 'A senha atual está incorreta.');
    }
    if (req.new_password === req.current_password)
      throw new DomainError('validation_failed', 'A nova senha precisa ser diferente da atual.');
    if (req.new_password.toLowerCase().includes(username))
      throw new DomainError('validation_failed', 'A nova senha não pode conter o nome de usuário.');
    await this.db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [
      userId,
      await hashPassword(req.new_password),
    ]);
    // Derruba todas as outras sessões; a atual continua.
    await this.db.query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [
      userId,
      sha256(currentToken ?? ''),
    ]);
  }

  async logout(token: string | undefined) {
    if (token) await this.db.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  }

  /** Valida o cookie: sessão existente e não expirada. Renova a validade de tempos em tempos (sessão deslizante). */
  async validate(token: string | undefined): Promise<SessionUser | null> {
    if (!token || token.length < 20 || token.length > 200) return null;
    const r = await this.db.query<SessionUser & { session_id: string; last_seen_at: Date }>(
      `SELECT s.id AS session_id, s.last_seen_at, u.id, u.username::text AS username, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [sha256(token)],
    );
    const row = r.rows[0];
    if (!row) return null;
    const now = this.clock();
    if (now.getTime() - row.last_seen_at.getTime() > RENEW_AFTER_MS) {
      await this.db.query(
        'UPDATE sessions SET last_seen_at = now(), expires_at = $2 WHERE id = $1',
        [row.session_id, new Date(now.getTime() + SESSION_DAYS * 86_400_000)],
      );
    }
    return { id: row.id, username: row.username, name: row.name, role: row.role };
  }
}
