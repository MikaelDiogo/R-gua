'use client';

import '@mantine/core/styles.css';
import { Button, createTheme, MantineProvider, PasswordInput, TextInput } from '@mantine/core';
import { useState } from 'react';
import { api, safeNext } from '@/lib/api';
import { Logo } from '../Icon';
import s from './auth.module.css';

/** Verde-petróleo da marca (tokens.css) como paleta do Mantine; o 6 é o `--accent` (#1e6b5a). */
const theme = createTheme({
  primaryColor: 'regua',
  primaryShade: 6,
  fontFamily: 'var(--font-sans)',
  defaultRadius: 'sm',
  components: {
    TextInput: {
      styles: { input: { background: 'var(--glass-bg-field)', borderColor: 'var(--glass-edge)' } },
    },
    PasswordInput: {
      styles: { input: { background: 'var(--glass-bg-field)', borderColor: 'var(--glass-edge)' } },
    },
  },
  colors: {
    regua: [
      '#f1f7f5',
      '#e3efea',
      '#c2dcd3',
      '#9bc5b8',
      '#6da995',
      '#3f8a76',
      '#1e6b5a',
      '#17574a',
      '#11443a',
      '#0b2f28',
    ],
  },
});

/** Entrada do sistema fechado: só nome do sistema, usuário, senha e botão. Não existe cadastro público. */
export function AuthForm({ next }: { next?: string }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api('/auth/login', {
      method: 'POST',
      body: { username: username.trim(), password },
    });
    if (r.ok) {
      // Navegação completa: o layout relê a sessão no servidor.
      window.location.assign(safeNext(next));
      return;
    }
    setBusy(false);
    setError(
      r.unreachable
        ? 'Não foi possível falar com o servidor. Tente de novo em instantes.'
        : [r.problem?.title, r.problem?.code === 'quota_exceeded' ? r.problem.detail : '']
            .filter(Boolean)
            .join(' ') || 'Não foi possível entrar.',
    );
  }

  return (
    <MantineProvider theme={theme} forceColorScheme="light">
      <main className={s.page}>
        <form onSubmit={submit} className={s.card} noValidate={false}>
          <h1 className={s.brand}>
            <Logo />
          </h1>

          <TextInput
            label="Usuário"
            size="md"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            withAsterisk={false}
            data-autofocus
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
          />
          <PasswordInput
            label="Senha"
            size="md"
            autoComplete="current-password"
            required
            withAsterisk={false}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />

          {error ? (
            <div className={s.error} role="alert">
              {error}
            </div>
          ) : null}

          <Button type="submit" size="md" fullWidth loading={busy}>
            Entrar
          </Button>
        </form>
      </main>
    </MantineProvider>
  );
}
