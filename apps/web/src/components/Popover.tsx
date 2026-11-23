'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon';
import s from './search.module.css';

/** Botão de filtro com painel flutuante. Fecha com Esc (devolve o foco ao botão) ou clicando fora. */
export function Popover({
  label,
  summary,
  active,
  children,
  align = 'left',
  inline = false,
}: {
  label: string;
  summary?: string;
  active?: boolean;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  /** Na coluna de filtros o painel abre no fluxo da página; solto, flutua sobre o conteúdo. */
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={s.popover} ref={root}>
      <button
        ref={btn}
        type="button"
        className={s.filterBtn}
        data-active={active || undefined}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{summary ? `${label}: ${summary}` : label}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open ? (
        <div
          className={`${s.popPanel} ${inline ? '' : s.popPanelFloat}`}
          id={panelId}
          data-align={align}
        >
          {children(() => {
            setOpen(false);
            btn.current?.focus();
          })}
        </div>
      ) : null}
    </div>
  );
}
