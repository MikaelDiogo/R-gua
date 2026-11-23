'use client';

import type { PipelineState } from '@agora/contracts';
import Link from 'next/link';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import b from './board.module.css';

export interface MenuStage {
  value: PipelineState;
  label: string;
}

type View = 'menu' | 'move' | 'confirm';

const WIDTH = 236;

/**
 * Ações do cartão do funil, escondidas atrás de um "⋯": só o essencial fica visível no cartão.
 * O painel é fixo na tela (portal) para não ser cortado pela rolagem da coluna. Fecha com Esc, clique fora,
 * rolagem ou redimensionamento; as setas ↑/↓ andam pelos itens.
 */
export function CardMenu({
  procurementId,
  current,
  stages,
  closing,
  disabled,
  hasAssignee,
  onMove,
  onAssignee,
  onNotes,
}: {
  procurementId: string;
  current: PipelineState;
  /** Etapas do quadro, na ordem. */
  stages: MenuStage[];
  /** "Encerrar como…" (desistência, descartado). */
  closing: MenuStage[];
  disabled?: boolean;
  hasAssignee: boolean;
  onMove: (to: PipelineState) => void;
  onAssignee: () => void;
  onNotes: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('menu');
  const [pos, setPos] = useState<{ top: number; left: number; max: number }>({
    top: 0,
    left: 0,
    max: 400,
  });
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  function close(refocus = false) {
    setOpen(false);
    setView('menu');
    if (refocus) btn.current?.focus();
  }

  function toggle() {
    if (open) return close();
    const r = btn.current?.getBoundingClientRect();
    if (r) {
      const left = Math.max(8, Math.min(r.right - WIDTH, window.innerWidth - WIDTH - 8));
      const top = Math.min(r.bottom + 6, window.innerHeight - 160);
      setPos({ top, left, max: window.innerHeight - top - 12 });
    }
    setView('menu');
    setOpen(true);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: `close` só mexe em estado e no foco; o efeito liga e desliga os ouvintes com `open`
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    const onScroll = (e: Event) => {
      if (!panel.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    panel.current
      ?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')
      ?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  // Ao trocar de visão (menu → etapas → confirmar), o foco vai para o primeiro item novo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: depende só da visão
  useEffect(() => {
    if (open)
      panel.current
        ?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')
        ?.focus();
  }, [view]);

  const walk = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [
      ...(panel.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ) ?? []),
    ];
    if (items.length === 0) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const pick = (fn: () => void) => () => {
    close(true);
    fn();
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={b.kmenuBtn}
        data-open={open || undefined}
        aria-label="Ações do edital"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={(e) => e.stopPropagation()}
        draggable={false}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
          <circle cx="3" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="13" cy="8" r="1.4" />
        </svg>
      </button>
      {open
        ? createPortal(
            <div
              ref={panel}
              id={id}
              role="menu"
              aria-label="Ações do edital"
              className={b.menu}
              style={{ top: pos.top, left: pos.left, width: WIDTH, maxHeight: pos.max }}
              onKeyDown={walk}
            >
              {view === 'menu' ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className={b.mitem}
                    onClick={() => setView('move')}
                  >
                    Mover para…
                    <span aria-hidden="true" className={b.mchev}>
                      ›
                    </span>
                  </button>
                  <Link
                    role="menuitem"
                    className={b.mitem}
                    href={`/editais/${procurementId}`}
                    onClick={() => close()}
                  >
                    Abrir edital
                  </Link>
                  <Link
                    role="menuitem"
                    className={b.mitem}
                    href={`/propostas/nova?edital=${procurementId}`}
                    onClick={() => close()}
                  >
                    Gerar proposta
                  </Link>
                  <Link
                    role="menuitem"
                    className={b.mitem}
                    href={`/precificador?edital=${procurementId}`}
                    onClick={() => close()}
                  >
                    Precificar
                  </Link>
                  <Link
                    role="menuitem"
                    className={b.mitem}
                    href={`/recursos/novo?edital=${procurementId}`}
                    onClick={() => close()}
                  >
                    Recurso ou impugnação
                  </Link>
                  <hr className={b.msep} />
                  <button
                    type="button"
                    role="menuitem"
                    className={b.mitem}
                    onClick={pick(onAssignee)}
                  >
                    {hasAssignee ? 'Alterar responsável' : 'Definir responsável'}
                  </button>
                  <button type="button" role="menuitem" className={b.mitem} onClick={pick(onNotes)}>
                    Notas…
                  </button>
                  <hr className={b.msep} />
                  <button
                    type="button"
                    role="menuitem"
                    className={`${b.mitem} ${b.mdanger}`}
                    onClick={() => setView('confirm')}
                  >
                    Remover do funil
                  </button>
                </>
              ) : null}

              {view === 'move' ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className={b.mitem}
                    onClick={() => setView('menu')}
                  >
                    <span aria-hidden="true">‹</span> Voltar
                  </button>
                  <p className={b.mlabel}>Etapas</p>
                  {stages.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      role="menuitem"
                      className={b.mitem}
                      aria-disabled={s.value === current || undefined}
                      aria-current={s.value === current ? 'true' : undefined}
                      onClick={s.value === current ? undefined : pick(() => onMove(s.value))}
                    >
                      {s.label}
                      {s.value === current ? <span className={b.mnow}>atual</span> : null}
                    </button>
                  ))}
                  <p className={b.mlabel}>Encerrar como</p>
                  {closing.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      role="menuitem"
                      className={b.mitem}
                      onClick={pick(() => onMove(s.value))}
                    >
                      {s.label}
                    </button>
                  ))}
                </>
              ) : null}

              {view === 'confirm' ? (
                <div className={b.mconfirm}>
                  <p>
                    Tirar este edital do funil? Ele vai para Encerrados, e você pode reabrir depois.
                  </p>
                  <div className={b.mrow}>
                    <button
                      type="button"
                      role="menuitem"
                      className="rg-btn wk-sm"
                      onClick={() => setView('menu')}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={`rg-btn wk-sm ${b.mremove}`}
                      onClick={pick(() => onMove('descartado'))}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
