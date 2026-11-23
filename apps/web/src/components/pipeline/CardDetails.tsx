'use client';

import type { PipelineCard } from '@agora/contracts';
import Link from 'next/link';
import { useId, useState } from 'react';
import { Icon } from '../Icon';
import s from './pipeline.module.css';

export interface SaveResult {
  ok: boolean;
  /** Mensagem do servidor quando recusou (ex.: conflito de versão). O texto da pessoa é mantido. */
  message?: string;
}

/**
 * Ações rápidas do card (abrir edital, proposta, precificador, recurso) e edição de responsável e notas.
 * O rascunho de texto vive aqui: se o servidor recusar (conflito de versão), o que a pessoa escreveu continua na
 * tela e o card é recarregado por fora.
 */
export function CardDetails({
  card,
  onSave,
}: {
  card: PipelineCard;
  onSave: (patch: { assignee?: string | null; notes?: string | null }) => Promise<SaveResult>;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [assignee, setAssignee] = useState(card.assignee ?? '');
  const [notes, setNotes] = useState(card.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const pid = card.procurement.id;

  const dirty = assignee.trim() !== (card.assignee ?? '') || notes.trim() !== (card.notes ?? '');

  async function save() {
    setBusy(true);
    setMsg(null);
    const patch: { assignee?: string | null; notes?: string | null } = {};
    if (assignee.trim() !== (card.assignee ?? '')) patch.assignee = assignee.trim() || null;
    if (notes.trim() !== (card.notes ?? '')) patch.notes = notes.trim() || null;
    const r = await onSave(patch);
    setBusy(false);
    setMsg(
      r.ok
        ? { kind: 'ok', text: 'Salvo.' }
        : { kind: 'error', text: r.message ?? 'Não foi possível salvar.' },
    );
  }

  return (
    <div className={s.more}>
      <button
        type="button"
        className={s.toggle}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
        Ações e notas
        {!open && card.notes ? <span className={s.hasNote}>· com nota</span> : null}
      </button>
      {open ? (
        <div className={s.panel} id={`${id}-panel`}>
          <div className={s.actions}>
            <Link href={`/editais/${pid}`}>
              <Icon name="doc" size={14} /> Abrir edital
            </Link>
            <Link href={`/propostas/nova?edital=${pid}`}>
              <Icon name="sparkle" size={14} /> Gerar proposta
            </Link>
            <Link href={`/precificador?edital=${pid}`}>Precificar</Link>
            <Link href={`/recursos/novo?edital=${pid}`}>Recurso ou impugnação</Link>
          </div>

          <div className={s.field}>
            <label htmlFor={`${id}-who`}>Responsável</label>
            <input
              id={`${id}-who`}
              value={assignee}
              maxLength={120}
              placeholder="Quem cuida deste edital"
              onChange={(e) => setAssignee(e.target.value)}
            />
          </div>
          <div className={s.field}>
            <label htmlFor={`${id}-notes`}>Notas</label>
            <textarea
              id={`${id}-notes`}
              rows={3}
              maxLength={4000}
              value={notes}
              placeholder="Anotações sobre este edital"
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {msg?.kind === 'error' ? (
            <div className={s.error} role="alert">
              {msg.text}
            </div>
          ) : null}
          <div className={s.save}>
            <button
              type="button"
              className="rg-btn rg-btn-primary wk-sm"
              disabled={!dirty || busy}
              onClick={save}
            >
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
            <span className={s.saved} role="status" aria-live="polite">
              {msg?.kind === 'ok' && !dirty ? msg.text : dirty ? 'Alterações não salvas' : ''}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
