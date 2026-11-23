'use client';

import { type ChangePasswordRequest, PASSWORD_MAX, PASSWORD_MIN } from '@agora/contracts';
import { type FormEvent, useState } from 'react';
import { api, problemText } from '@/lib/api';
import { Notice, StateBlock } from '../ui';
import s from './conta.module.css';

type State =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'done' }
  | { kind: 'error'; title: string; detail: string };

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  help,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  help?: string;
  invalid?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={s.inputRow}>
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          maxLength={PASSWORD_MAX}
          autoComplete={autoComplete}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value)}
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
      {help ? <span className="fieldHelp">{help}</span> : null}
    </div>
  );
}

/** A identidade vem da sessão: o corpo leva só as duas senhas (docs/04). O servidor encerra as outras sessões. */
export function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  const tooShort = next.length > 0 && next.length < PASSWORD_MIN;
  const mismatch = confirm.length > 0 && confirm !== next;
  const ready = current.length > 0 && next.length >= PASSWORD_MIN && confirm === next;
  const saving = state.kind === 'saving';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || saving) return;
    setState({ kind: 'saving' });
    const body: ChangePasswordRequest = { current_password: current, new_password: next };
    const r = await api<null>('/auth/password', { method: 'POST', body });
    if (r.ok) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setState({ kind: 'done' });
    } else {
      setState({ kind: 'error', ...problemText(r) });
    }
  }

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      {state.kind === 'done' ? (
        <div role="status">
          <Notice>Senha alterada. Outras sessões foram encerradas.</Notice>
        </div>
      ) : null}
      {state.kind === 'error' ? (
        <div role="alert">
          <StateBlock kind="error" title={state.title}>
            {state.detail}
          </StateBlock>
        </div>
      ) : null}

      <PasswordField
        id="pw-current"
        label="Senha atual"
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
      />
      <PasswordField
        id="pw-new"
        label="Nova senha"
        value={next}
        onChange={setNext}
        autoComplete="new-password"
        invalid={tooShort}
        help={`Pelo menos ${PASSWORD_MIN} caracteres.`}
      />
      {tooShort ? (
        <span className="fieldError">
          Faltam {PASSWORD_MIN - next.length} caracteres para chegar a {PASSWORD_MIN}.
        </span>
      ) : null}
      <PasswordField
        id="pw-confirm"
        label="Repita a nova senha"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        invalid={mismatch}
      />
      {mismatch ? <span className="fieldError">As senhas não são iguais.</span> : null}

      <div className={s.actions}>
        <button type="submit" className="rg-btn rg-btn-primary" disabled={!ready || saving}>
          {saving ? 'Salvando…' : 'Alterar senha'}
        </button>
      </div>
    </form>
  );
}
