'use client';

import type { ConversationSummary } from '@agora/contracts';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  CONVERSATIONS_EVENT,
  deleteConversation,
  listConversations,
  notifyConversations,
  renameConversation,
} from '@/lib/conversations';
import { ConvoMenu } from './ConvoMenu';
import s from './conversas.module.css';

/** No máximo 4: o resto fica em "Ver todas" (como no Claude). */
const MAX_RECENTS = 4;

export interface RecentsData {
  items: ConversationSummary[];
  hasMore: boolean;
}

/**
 * "Recentes" da barra lateral. Nasce com o que o servidor leu no layout e se relê sozinha quando uma conversa
 * é criada, renomeada ou excluída. Se a API falhar, a seção some sem quebrar a barra.
 */
export function RecentChats({ initial }: { initial: RecentsData | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = pathname === '/chat' ? params.get('c') : null;

  const [data, setData] = useState<RecentsData | null>(initial);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menuOf, setMenuOf] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const alive = useRef(true);
  const saving = useRef(false);

  async function reload() {
    const r = await listConversations({ limit: MAX_RECENTS });
    if (!alive.current || !r.ok) return; // falhou: mantém o que já está na tela
    setData({ items: r.data.items.slice(0, MAX_RECENTS), hasMore: r.data.next_cursor !== null });
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: relê ao navegar e quando algo muda uma conversa
  useEffect(() => {
    alive.current = true;
    window.addEventListener(CONVERSATIONS_EVENT, reload);
    return () => {
      alive.current = false;
      window.removeEventListener(CONVERSATIONS_EVENT, reload);
    };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: cada navegação atualiza a lista
  useEffect(() => {
    void reload();
  }, [pathname, current]);

  if (!data) return null;

  async function saveRename(id: string) {
    if (saving.current) return; // Enter e perda de foco chegam juntos: salva uma vez só
    saving.current = true;
    try {
      await doRename(id);
    } finally {
      saving.current = false;
    }
  }

  async function doRename(id: string) {
    const title = draft.trim();
    const old = data?.items.find((c) => c.id === id)?.title;
    if (!title || title === old) {
      setRenaming(null);
      return;
    }
    const r = await renameConversation(id, title);
    if (!r.ok) {
      setRenameError(r.problem?.detail ?? 'Não consegui renomear. Tente de novo.');
      return;
    }
    setRenaming(null);
    setRenameError(null);
    setData((d) => d && { ...d, items: d.items.map((c) => (c.id === id ? { ...c, title } : c)) });
    notifyConversations();
  }

  async function remove(id: string): Promise<string | null> {
    const r = await deleteConversation(id);
    if (!r.ok) return r.problem?.detail ?? 'Não consegui excluir. Tente de novo.';
    setData((d) => d && { ...d, items: d.items.filter((c) => c.id !== id) });
    notifyConversations();
    if (current === id) router.push('/chat');
    return null;
  }

  return (
    <div className={s.recents}>
      <div className="rg-nav-group">Recentes</div>
      {data.items.length === 0 ? (
        <p className={s.hint}>As conversas do chat aparecem aqui.</p>
      ) : (
        <ul className={s.list}>
          {data.items.map((c) => (
            <li
              key={c.id}
              className={s.row}
              data-current={current === c.id ? '' : undefined}
              data-menu={menuOf === c.id ? '' : undefined}
            >
              {renaming === c.id ? (
                <form
                  className={s.rename}
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
                        setRenameError(null);
                      }
                    }}
                    onBlur={() => void saveRename(c.id)}
                  />
                  {renameError ? (
                    <p className={`${s.hint} ${s.hintError}`} role="alert">
                      {renameError}
                    </p>
                  ) : null}
                </form>
              ) : (
                <>
                  <Link
                    href={`/chat?c=${c.id}`}
                    className={s.link}
                    title={c.title}
                    aria-current={current === c.id ? 'page' : undefined}
                  >
                    <span className={s.title}>{c.title}</span>
                  </Link>
                  <ConvoMenu
                    title={c.title}
                    onOpenChange={(open) => setMenuOf(open ? c.id : null)}
                    onRename={() => {
                      setDraft(c.title);
                      setRenameError(null);
                      setRenaming(c.id);
                    }}
                    onDelete={() => remove(c.id)}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <Link href="/chat/conversas" className={`rg-btn rg-btn-quiet ${s.all}`}>
        {data.hasMore ? 'Ver todas as conversas' : 'Ver todas'}
      </Link>
    </div>
  );
}
