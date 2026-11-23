'use client';

import type { SuggestResponse } from '@agora/contracts';
import { type KeyboardEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { HistoryEntry } from '@/lib/history';
import { Icon } from './Icon';
import s from './search.module.css';

interface Suggestion {
  kind: 'recent' | 'correction' | 'term';
  text: string;
  label: string;
}

/**
 * Campo de palavra-chave com sugestões e histórico. Padrão "lista de botões": ↓ vai para a lista, ↑/↓ andam
 * entre os itens, Enter escolhe, Esc fecha. Tudo também funciona com Tab.
 */
export function SearchBox({
  value,
  onChange,
  onSubmit,
  history,
  onPickHistory,
  onToggleFav,
  onRemove,
  onClearHistory,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  history: HistoryEntry[];
  onPickHistory: (e: HistoryEntry) => void;
  onToggleFav: (e: HistoryEntry) => void;
  onRemove: (e: HistoryEntry) => void;
  onClearHistory: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const typing = value.trim().length >= 2;
  // Sugestões vêm da API (GET /v1/search/suggest). Sem resposta, só as buscas recentes casam.
  const [remote, setRemote] = useState<Suggestion[]>([]);
  const [remoteFailed, setRemoteFailed] = useState(false);
  useEffect(() => {
    if (!typing || !open) return;
    let alive = true;
    const t = window.setTimeout(async () => {
      const r = await api<SuggestResponse>(`/search/suggest?q=${encodeURIComponent(value.trim())}`);
      if (!alive) return;
      setRemoteFailed(!r.ok);
      if (!r.ok) return setRemote([]);
      setRemote([
        ...(r.data.did_you_mean
          ? [{ kind: 'correction' as const, text: r.data.did_you_mean, label: 'Você quis dizer' }]
          : []),
        ...r.data.terms.map((text) => ({ kind: 'term' as const, text, label: 'Sugestão' })),
      ]);
    }, 200);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [value, typing, open]);
  const fold = (x: string) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const recentMatches: Suggestion[] = history
    .filter((h) => h.q && fold(h.q).includes(fold(value.trim())))
    .slice(0, 3)
    .map((h) => ({ kind: 'recent' as const, text: h.q, label: 'Busca recente' }));
  const suggestions: Suggestion[] = typing
    ? [...remote, ...recentMatches].filter(
        (s, i, all) => all.findIndex((o) => fold(o.text) === fold(s.text)) === i,
      )
    : [];
  const favs = history.filter((h) => h.fav);
  const recents = history.filter((h) => !h.fav).slice(0, 5);
  const hasHistory = history.length > 0;

  const buttons = () => [
    ...(list.current?.querySelectorAll<HTMLButtonElement>('[data-sug]') ?? []),
  ];
  const move = (dir: 1 | -1) => {
    const all = buttons();
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    const next = all[i === -1 ? (dir === 1 ? 0 : all.length - 1) : i + dir];
    if (next) next.focus();
    else if (dir === -1) inputRef.current?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => move(1));
    } else if (e.key === 'ArrowUp' && e.target !== inputRef.current) {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Escape' && open) {
      setOpen(false);
      inputRef.current?.focus();
    }
  };
  const pick = (text: string) => {
    onChange(text);
    onSubmit(text);
    setOpen(false);
  };
  const row = (h: HistoryEntry) => (
    <div className={s.sugRow} key={`${h.q}|${h.qs}`}>
      <button
        type="button"
        data-sug
        className={s.sugMain}
        onClick={() => {
          onPickHistory(h);
          setOpen(false);
        }}
      >
        <Icon name="clock" size={14} />
        <span className={s.sugText}>{h.q || 'Busca só com filtros'}</span>
        {h.qs ? <span className={s.sugTag}>com filtros</span> : null}
      </button>
      <button
        type="button"
        data-sug
        className={s.iconBtn}
        data-on={h.fav || undefined}
        aria-pressed={h.fav}
        aria-label={h.fav ? `Remover ${h.q} das favoritas` : `Favoritar a busca ${h.q}`}
        onClick={() => onToggleFav(h)}
      >
        <Icon name="star" size={14} />
      </button>
      <button
        type="button"
        data-sug
        className={s.iconBtn}
        aria-label={`Apagar ${h.q} do histórico`}
        onClick={() => onRemove(h)}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: captura as setas das sugestões; os controles são botões
    <div className={s.searchBox} ref={root} onKeyDown={onKey}>
      <form
        className={s.searchField}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value);
          setOpen(false);
        }}
      >
        <Icon name="search" />
        <label htmlFor="q" className={s.srOnly}>
          Buscar editais
        </label>
        <input
          id="q"
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Palavra-chave, número do pregão, CNPJ ou uma frase"
          autoComplete="off"
        />
        <span className={s.kbd} aria-hidden="true">
          /
        </span>
        <button type="submit" className="rg-btn rg-btn-primary">
          Buscar
        </button>
      </form>

      {open ? (
        <div className={s.sugPanel} id="sug-panel" ref={list}>
          {typing ? (
            suggestions.length ? (
              <div className={s.sugGroup}>
                {suggestions.map((sg) => (
                  <button
                    type="button"
                    data-sug
                    className={s.sugMain}
                    key={`${sg.kind}-${sg.text}`}
                    onClick={() => pick(sg.text)}
                  >
                    <Icon name={sg.kind === 'correction' ? 'sparkle' : 'search'} size={14} />
                    <span className={s.sugText}>{sg.text}</span>
                    <span className={s.sugTag}>{sg.label}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className={s.sugEmpty}>
                {remoteFailed ? 'Sugestões indisponíveis agora. ' : ''}Aperte Enter para buscar “
                {value.trim()}”.
              </p>
            )
          ) : (
            <>
              {favs.length ? (
                <div className={s.sugGroup}>
                  <p className={s.sugHead}>Favoritas</p>
                  {favs.map(row)}
                </div>
              ) : null}
              {recents.length ? (
                <div className={s.sugGroup}>
                  <p className={s.sugHead}>Buscas recentes</p>
                  {recents.map(row)}
                </div>
              ) : null}
              {!hasHistory ? (
                <p className={s.sugEmpty}>
                  Suas buscas recentes e favoritas aparecem aqui. Escreva uma palavra e aperte
                  Enter.
                </p>
              ) : null}
              {recents.length ? (
                <button
                  type="button"
                  data-sug
                  className={`${s.linkBtn} ${s.sugClear}`}
                  onClick={onClearHistory}
                >
                  Limpar histórico
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
