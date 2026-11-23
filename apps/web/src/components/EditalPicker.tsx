'use client';

import type { SearchResponse } from '@agora/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callLong } from '@/lib/call';
import type { Failure } from '@/lib/failure';
import { fmtBRL, readableName } from '@/lib/format';
import { Icon } from './Icon';
import s from './search.module.css';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; data: SearchResponse }
  | { kind: 'error'; failure: Failure };

/**
 * Escolher um edital para a próxima tela (proposta, precificador, recursos): busca simples por palavras entre os
 * editais abertos, ou cola o identificador. Vazio só quando a busca respondeu ok.
 */
export function EditalPicker({
  target,
  title,
}: {
  target: '/propostas/nova' | '/precificador' | '/recursos/novo';
  title: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const go = (id: string) => router.push(`${target}?edital=${encodeURIComponent(id)}`);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (UUID.test(text)) return go(text);
    if (text.length < 2) return;
    setPhase({ kind: 'loading' });
    const r = await callLong<SearchResponse>(
      '/search',
      {
        method: 'POST',
        body: { q: text, filters: { status: ['open_for_proposals'] }, limit: 8, sort: 'relevance' },
      },
      { timeoutMs: 20_000 },
    );
    setPhase(r.ok ? { kind: 'done', data: r.data } : { kind: 'error', failure: r.failure });
  }

  return (
    <section className={s.picker} aria-labelledby="picker-h">
      <h2 id="picker-h" className={s.pickerTitle}>
        {title}
      </h2>
      <form className={s.pickerForm} onSubmit={search} aria-label="Buscar edital">
        <label htmlFor="picker-q" className={s.srOnly}>
          Buscar edital por palavras ou colar o identificador
        </label>
        <input
          id="picker-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Palavras do objeto (ex.: notebook) ou o identificador do edital"
        />
        <button type="submit" className="rg-btn rg-btn-primary" disabled={phase.kind === 'loading'}>
          <Icon name="search" size={14} /> {phase.kind === 'loading' ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {phase.kind === 'error' ? (
        <div className="rg-banner rg-banner-error" role="alert">
          <div className="rg-banner-body">
            <p className="rg-banner-title">{phase.failure.title}</p>
            <p>{phase.failure.detail}</p>
          </div>
        </div>
      ) : null}

      {phase.kind === 'done' && phase.data.items.length === 0 ? (
        <div className="rg-empty">
          <div className="rg-empty-body">
            <p className="rg-empty-title">Nenhum edital aberto com essas palavras.</p>
            <p>A base ainda é uma parte do PNCP. Tente outros termos ou use o Buscador.</p>
          </div>
        </div>
      ) : null}

      {phase.kind === 'done' && phase.data.items.length > 0 ? (
        <ul className={s.pickerList}>
          {phase.data.items.map((i) => (
            <li key={i.id} className={s.pickerItem}>
              <div className={s.pickerText}>
                <p className={s.pickerObject}>{i.object}</p>
                <p className={s.pickerMeta}>
                  {readableName(i.organ.name)} · {i.organ.uf ?? '—'} ·{' '}
                  {i.estimated_value ? fmtBRL(i.estimated_value) : '—'} · {i.deadline.label}
                </p>
              </div>
              <button type="button" className="rg-btn" onClick={() => go(i.id)}>
                Escolher
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
