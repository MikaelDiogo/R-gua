'use client';

import type { ConversationSummary } from '@agora/contracts';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DAY_GROUPS,
  type DayGroup,
  dayGroup,
  deleteConversation,
  listConversations,
  notifyConversations,
  renameConversation,
  shortWhen,
} from '@/lib/conversations';
import { ConvoMenu } from './ConvoMenu';
import s from './conversas.module.css';

const PAGE = 20;

const Lupa = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </svg>
);

type Load = 'idle' | 'loading' | 'error';

/**
 * Tela "Todas as conversas": busca por título, lista por dia e "Carregar mais". O servidor entrega a primeira página
 * e o relógio dele (`serverNow`): os grupos Hoje/Ontem usam esse relógio, não o do navegador.
 */
export function AllConversations({
  initialItems,
  initialCursor,
  initialFailed,
  serverNow,
}: {
  initialItems: ConversationSummary[];
  initialCursor: string | null;
  initialFailed: boolean;
  serverNow: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [q, setQ] = useState('');
  const [load, setLoad] = useState<Load>(initialFailed ? 'error' : 'idle');
  const [more, setMore] = useState<Load>('idle');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);
  const seq = useRef(0);
  const first = useRef(true);
  const saving = useRef(false);

  // Deslocamento entre o relógio do servidor e o do navegador, medido uma vez.
  const offset = useRef(new Date(serverNow).getTime() - Date.now());
  const now = () => Date.now() + offset.current;

  // Busca por título: espera a pessoa parar de digitar e descarta respostas antigas.
  // biome-ignore lint/correctness/useExhaustiveDependencies: roda só quando o texto muda
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const mine = ++seq.current;
    const t = window.setTimeout(async () => {
      setLoad('loading');
      const r = await listConversations({ limit: PAGE, q });
      if (mine !== seq.current) return;
      if (!r.ok) {
        setLoad('error');
        return;
      }
      setItems(r.data.items);
      setCursor(r.data.next_cursor);
      setLoad('idle');
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  async function retry() {
    const mine = ++seq.current;
    setLoad('loading');
    const r = await listConversations({ limit: PAGE, q });
    if (mine !== seq.current) return;
    if (!r.ok) {
      setLoad('error');
      return;
    }
    setItems(r.data.items);
    setCursor(r.data.next_cursor);
    setLoad('idle');
  }

  async function loadMore() {
    if (!cursor || more === 'loading') return;
    setMore('loading');
    const r = await listConversations({ limit: PAGE, q, cursor });
    if (!r.ok) {
      setMore('error');
      return;
    }
    setItems((all) => {
      const seen = new Set(all.map((c) => c.id));
      return [...all, ...r.data.items.filter((c) => !seen.has(c.id))];
    });
    setCursor(r.data.next_cursor);
    setMore('idle');
  }

  async function saveRename(id: string) {
    if (saving.current) return;
    saving.current = true;
    try {
      const title = draft.trim();
      const old = items.find((c) => c.id === id)?.title;
      if (!title || title === old) {
        setRenaming(null);
        return;
      }
      const r = await renameConversation(id, title);
      if (!r.ok) {
        setRowError(r.problem?.detail ?? 'Não consegui renomear. Tente de novo.');
        return;
      }
      setRenaming(null);
      setRowError(null);
      setItems((all) => all.map((c) => (c.id === id ? { ...c, title } : c)));
      notifyConversations();
    } finally {
      saving.current = false;
    }
  }

  async function remove(id: string): Promise<string | null> {
    const r = await deleteConversation(id);
    if (!r.ok) return r.problem?.detail ?? 'Não consegui excluir. Tente de novo.';
    setItems((all) => all.filter((c) => c.id !== id));
    notifyConversations();
    return null;
  }

  const groups = useMemo(() => {
    // Grupos pelo relógio do servidor na hora em que a página foi montada: igual no servidor e no navegador.
    const t = new Date(serverNow).getTime();
    const by = new Map<DayGroup, ConversationSummary[]>();
    for (const c of items) {
      const g = dayGroup(c.updated_at, t);
      by.set(g, [...(by.get(g) ?? []), c]);
    }
    return DAY_GROUPS.filter((g) => by.has(g)).map((g) => ({ label: g, list: by.get(g) ?? [] }));
  }, [items, serverNow]);

  const searching = q.trim().length > 0;

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div>
          <h1>Todas as conversas</h1>
          <p className={s.sub}>Volte a uma conversa e continue de onde parou.</p>
        </div>
        <Link href="/chat" className="rg-btn rg-btn-primary">
          Nova conversa
        </Link>
      </div>

      <label className={s.search}>
        <Lupa />
        <span className="sr-only">Buscar conversa pelo título</span>
        <input
          type="search"
          value={q}
          maxLength={120}
          placeholder="Buscar pelo título"
          onChange={(e) => setQ(e.target.value)}
        />
      </label>

      {load === 'loading' && items.length === 0 ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="Carregando conversas"
          style={{ display: 'grid', gap: 8 }}
        >
          <div className={s.skel} />
          <div className={s.skel} />
          <div className={s.skel} />
        </div>
      ) : null}

      {load === 'error' ? (
        <div className="rg-banner rg-banner-error" role="alert">
          <div className="rg-banner-body">
            <p className="rg-banner-title">Não consegui carregar as conversas.</p>
            <p>Isso não quer dizer que elas sumiram. Tente de novo.</p>
          </div>
          <button type="button" className="rg-btn" onClick={() => void retry()}>
            Tentar de novo
          </button>
        </div>
      ) : null}

      {load !== 'error' && load !== 'loading' && items.length === 0 ? (
        <div className="rg-empty">
          <div className="rg-empty-head">{searching ? 'Nenhum resultado' : 'Conversas'}</div>
          <div className="rg-empty-body">
            <p className="rg-empty-title">
              {searching
                ? `Nenhuma conversa com “${q.trim()}” no título.`
                : 'Você ainda não tem conversas.'}
            </p>
            <p>
              {searching
                ? 'Tente outra palavra ou apague a busca.'
                : 'Faça uma pergunta no chat e ela fica guardada aqui.'}
            </p>
            {searching ? (
              <button type="button" className="rg-btn" onClick={() => setQ('')}>
                Limpar busca
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {groups.map((g) => (
        <section key={g.label} className={s.group} aria-label={g.label}>
          <h2 className={s.groupLabel}>{g.label}</h2>
          <ul className={s.items}>
            {g.list.map((c) => (
              <li key={c.id} className={s.item}>
                {renaming === c.id ? (
                  <form
                    className={s.itemRename}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveRename(c.id);
                    }}
                  >
                    <input
                      // biome-ignore lint/a11y/noAutofocus: a pessoa acabou de pedir para renomear
                      autoFocus
                      value={draft}
                      maxLength={120}
                      aria-label="Novo nome da conversa"
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setRenaming(null);
                          setRowError(null);
                        }
                      }}
                    />
                    <button type="submit" className="rg-btn">
                      Salvar
                    </button>
                    <button
                      type="button"
                      className="rg-btn rg-btn-quiet"
                      onClick={() => {
                        setRenaming(null);
                        setRowError(null);
                      }}
                    >
                      Cancelar
                    </button>
                    {rowError ? (
                      <span className={s.errorLine} role="alert">
                        {rowError}
                      </span>
                    ) : null}
                  </form>
                ) : (
                  <>
                    <Link href={`/chat?c=${c.id}`} className={s.itemLink}>
                      <span className={s.itemTitle}>{c.title}</span>
                      <span className={s.itemMeta}>
                        {shortWhen(c.updated_at, now())} · {c.message_count}{' '}
                        {c.message_count === 1 ? 'mensagem' : 'mensagens'}
                      </span>
                    </Link>
                    <ConvoMenu
                      className={s.itemMore}
                      title={c.title}
                      onRename={() => {
                        setDraft(c.title);
                        setRowError(null);
                        setRenaming(c.id);
                      }}
                      onDelete={() => remove(c.id)}
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {cursor && load === 'idle' ? (
        <>
          <button
            type="button"
            className={`rg-btn ${s.more2}`}
            disabled={more === 'loading'}
            onClick={() => void loadMore()}
          >
            {more === 'loading' ? 'Carregando…' : 'Carregar mais'}
          </button>
          {more === 'error' ? (
            <p className={s.errorLine} role="alert" style={{ textAlign: 'center' }}>
              Não consegui carregar mais. Tente de novo.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
