'use client';

import { useEffect, useRef, useState } from 'react';
import s from './conversas.module.css';

const Dots = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="19" cy="12" r="1.7" />
  </svg>
);

/**
 * Menu "⋯" de uma conversa: Renomear e Excluir (com confirmação na própria lista). Fecha com Esc ou clicando fora
 * e devolve o foco ao botão. A ação em si (chamar a API, atualizar a lista) fica com quem usa o menu.
 */
export function ConvoMenu({
  title,
  onRename,
  onDelete,
  onOpenChange,
  className,
}: {
  title: string;
  onRename: () => void;
  /** Devolve uma mensagem de erro, ou `null` quando excluiu. */
  onDelete: () => Promise<string | null>;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  function close(returnFocus = false) {
    setOpen(false);
    setConfirming(false);
    setError(null);
    onOpenChange?.(false);
    if (returnFocus) btn.current?.focus();
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: só reage a abrir/fechar
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  async function remove() {
    setBusy(true);
    setError(null);
    const err = await onDelete();
    setBusy(false);
    if (err) setError(err);
    else close();
  }

  return (
    <div ref={root} className={className} style={{ position: 'relative' }}>
      <button
        ref={btn}
        type="button"
        className={s.more}
        aria-label={`Opções da conversa: ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          onOpenChange?.(next);
        }}
      >
        <Dots />
      </button>
      {open ? (
        <div className={`rg-glass ${s.menu}`} role="menu" aria-label="Opções da conversa">
          {confirming ? (
            <div className={s.confirm}>
              <p>Excluir esta conversa? Isso não pode ser desfeito.</p>
              {error ? (
                <p className={s.errorLine} role="alert">
                  {error}
                </p>
              ) : null}
              <div className={s.confirmBtns}>
                <button
                  type="button"
                  className="rg-btn"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  {busy ? 'Excluindo…' : 'Excluir'}
                </button>
                <button
                  type="button"
                  className="rg-btn rg-btn-quiet"
                  disabled={busy}
                  onClick={() => close(true)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                className={s.menuItem}
                onClick={() => {
                  close();
                  onRename();
                }}
              >
                Renomear
              </button>
              <button
                type="button"
                role="menuitem"
                className={`${s.menuItem} ${s.menuDanger}`}
                onClick={() => setConfirming(true)}
              >
                Excluir
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
