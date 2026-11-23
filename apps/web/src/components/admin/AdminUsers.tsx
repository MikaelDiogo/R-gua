'use client';

import {
  type AdminUser,
  type AdminUsersResponse,
  type CreateUserRequest,
  type CreateUserResponse,
  PASSWORD_MAX,
  PASSWORD_MIN,
  type ResetPasswordRequest,
  type ResetPasswordResponse,
  USERNAME_RE,
} from '@agora/contracts';
import { type FormEvent, useState } from 'react';
import { api, newKey, problemText } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { Dash, StateBlock } from '../ui';
import s from './admin.module.css';

type Role = AdminUser['role'];
const ROLE_LABEL: Record<Role, string> = { admin: 'Administrador', user: 'Usuário' };

/** Senha mostrada UMA vez: fica só neste estado de tela, nunca em localStorage, URL ou log. */
type Reveal = { who: string; password: string | null; kind: 'created' | 'reset' };

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function RevealBox({ reveal, onClose }: { reveal: Reveal; onClose: () => void }) {
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  return (
    <section className={`wk-panel wk-glass ${s.reveal}`} aria-live="polite">
      <div className="wk-panel-head">
        <h2>{reveal.kind === 'created' ? 'Conta criada' : 'Senha redefinida'}</h2>
        <button type="button" className="rg-btn rg-btn-quiet" onClick={onClose}>
          Fechar
        </button>
      </div>
      <p className="wk-meta">
        Usuário: <strong>{reveal.who}</strong>
      </p>
      {reveal.password ? (
        <>
          <div className={s.secretRow}>
            <code className={s.secret}>{reveal.password}</code>
            <button
              type="button"
              className="rg-btn"
              onClick={async () => setCopied((await copy(reveal.password ?? '')) ? 'ok' : 'fail')}
            >
              Copiar senha
            </button>
          </div>
          <p className="wk-hint" role="status">
            {copied === 'ok'
              ? 'Copiada.'
              : copied === 'fail'
                ? 'Não consegui copiar. Selecione o texto e copie à mão.'
                : 'Anote agora: não será mostrada de novo.'}
          </p>
        </>
      ) : (
        <p className="wk-hint">
          A senha informada foi guardada. Passe-a à pessoa por um canal seguro.
        </p>
      )}
    </section>
  );
}

export function AdminUsers({
  initial,
  currentUserId,
  loadedAt,
}: {
  initial: AdminUser[];
  currentUserId: string | null;
  loadedAt: string;
}) {
  const [users, setUsers] = useState<AdminUser[]>(initial);
  const [stale, setStale] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);

  // formulário
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const [saving, setSaving] = useState(false);

  const usernameBad = username.length > 0 && !USERNAME_RE.test(username.trim().toLowerCase());
  const passwordBad = password.length > 0 && password.length < PASSWORD_MIN;
  const ready = USERNAME_RE.test(username.trim().toLowerCase()) && !passwordBad;

  async function reload() {
    const r = await api<AdminUsersResponse>('/admin/users');
    if (r.ok) {
      setUsers(r.data.items);
      setStale(null);
    } else setStale(r.at);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    setError(null);
    const body: CreateUserRequest = {
      username: username.trim().toLowerCase(),
      role,
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(password ? { password } : {}),
    };
    const r = await api<CreateUserResponse>('/admin/users', {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': newKey() },
    });
    setSaving(false);
    if (!r.ok) {
      setError(problemText(r));
      return;
    }
    setReveal({ who: r.data.user.username, password: r.data.generated_password, kind: 'created' });
    setUsername('');
    setName('');
    setRole('user');
    setPassword('');
    setCreating(false);
    await reload();
  }

  async function resetPassword(u: AdminUser) {
    setRowBusy(u.id);
    setError(null);
    const body: ResetPasswordRequest = {};
    const r = await api<ResetPasswordResponse>(`/admin/users/${u.id}/reset-password`, {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': newKey() },
    });
    setRowBusy(null);
    if (!r.ok) {
      setError(problemText(r));
      return;
    }
    setReveal({ who: u.username, password: r.data.generated_password, kind: 'reset' });
  }

  async function remove(u: AdminUser) {
    setRowBusy(u.id);
    setError(null);
    const r = await api<null>(`/admin/users/${u.id}`, {
      method: 'DELETE',
      headers: { 'Idempotency-Key': newKey() },
    });
    setRowBusy(null);
    setConfirmDelete(null);
    if (!r.ok) {
      setError(problemText(r));
      return;
    }
    await reload();
  }

  return (
    <div className={s.wrap}>
      <div className={s.bar}>
        <p className="wk-meta">
          {users.length === 0 ? 'Nenhuma conta ainda.' : `${users.length} conta(s)`} · lido em{' '}
          {fmtDateTime(loadedAt)}
        </p>
        <button
          type="button"
          className="rg-btn rg-btn-primary"
          aria-expanded={creating}
          onClick={() => {
            setCreating((v) => !v);
            setError(null);
          }}
        >
          {creating ? 'Cancelar' : 'Criar conta'}
        </button>
      </div>

      {stale ? (
        <StateBlock kind="degraded" title="Não consegui atualizar a lista">
          Mostrando a última leitura ({fmtDateTime(stale)}). Tente de novo em instantes.
        </StateBlock>
      ) : null}
      {error ? (
        <StateBlock kind="error" title={error.title}>
          {error.detail}
        </StateBlock>
      ) : null}
      {reveal ? <RevealBox reveal={reveal} onClose={() => setReveal(null)} /> : null}

      {creating ? (
        <form className={`wk-panel wk-glass ${s.form}`} onSubmit={create} autoComplete="off">
          <div className="wk-panel-head">
            <h2>Nova conta</h2>
          </div>
          <div className={s.grid}>
            <div className="wk-field">
              <label htmlFor="adm-user">Usuário</label>
              <input
                id="adm-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={usernameBad || undefined}
              />
              <span className={usernameBad ? 'wk-error' : 'wk-help'}>
                3 a 32 caracteres: minúsculas, números, ponto, hífen e sublinhado.
              </span>
            </div>
            <div className="wk-field">
              <label htmlFor="adm-name">Nome (opcional)</label>
              <input
                id="adm-name"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="wk-field">
              <label htmlFor="adm-role">Papel</label>
              <select id="adm-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="user">Usuário</option>
                <option value="admin">Administrador</option>
              </select>
              <span className="wk-help">Administradores criam e removem contas.</span>
            </div>
            <div className="wk-field">
              <label htmlFor="adm-pass">Senha (opcional)</label>
              <div className={s.passRow}>
                <input
                  id="adm-pass"
                  type={shown ? 'text' : 'password'}
                  value={password}
                  maxLength={PASSWORD_MAX}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={passwordBad || undefined}
                />
                <button
                  type="button"
                  className={s.toggle}
                  aria-pressed={shown}
                  onClick={() => setShown((v) => !v)}
                >
                  {shown ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              <span className={passwordBad ? 'wk-error' : 'wk-help'}>
                {passwordBad
                  ? `Use pelo menos ${PASSWORD_MIN} caracteres.`
                  : 'Deixe vazio para gerar uma senha forte.'}
              </span>
            </div>
          </div>
          <div className={s.actions}>
            <button type="submit" className="rg-btn rg-btn-primary" disabled={!ready || saving}>
              {saving ? 'Criando…' : password ? 'Criar conta' : 'Criar com senha gerada'}
            </button>
          </div>
        </form>
      ) : null}

      {users.length === 0 ? (
        <StateBlock kind="empty" title="Nenhuma conta">
          Use "Criar conta" para dar acesso a alguém.
        </StateBlock>
      ) : (
        <div className="rg-table-wrap">
          <table className="rg-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Papel</th>
                <th>Criada em</th>
                <th>Último acesso</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = u.id === currentUserId;
                const busy = rowBusy === u.id;
                return (
                  <tr key={u.id}>
                    <td>
                      <span className="rg-strong">{u.username}</span>
                      <span className="rg-sub">{u.name ?? 'Sem nome'}</span>
                    </td>
                    <td>
                      <span className={`rg-tag ${u.role === 'admin' ? 'rg-tag-accent' : ''}`}>
                        {ROLE_LABEL[u.role]}
                      </span>
                    </td>
                    <td className="wk-num">{fmtDate(u.created_at)}</td>
                    <td className="wk-num">
                      {u.last_login_at ? (
                        fmtDateTime(u.last_login_at)
                      ) : (
                        <Dash why="Esta conta ainda não entrou" />
                      )}
                    </td>
                    <td>
                      <div className={s.rowActions}>
                        {confirmDelete === u.id ? (
                          <>
                            <span className="wk-meta">Excluir "{u.username}"?</span>
                            <button
                              type="button"
                              className="rg-btn"
                              disabled={busy}
                              onClick={() => remove(u)}
                            >
                              Excluir agora
                            </button>
                            <button
                              type="button"
                              className="rg-btn rg-btn-quiet"
                              onClick={() => setConfirmDelete(null)}
                            >
                              Voltar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="rg-btn rg-btn-quiet"
                              disabled={busy}
                              onClick={() => resetPassword(u)}
                            >
                              {busy ? 'Aguarde…' : 'Redefinir senha'}
                            </button>
                            <button
                              type="button"
                              className="rg-btn rg-btn-quiet"
                              disabled={busy || self}
                              title={self ? 'Você não pode excluir a própria conta' : undefined}
                              onClick={() => setConfirmDelete(u.id)}
                            >
                              Excluir
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
