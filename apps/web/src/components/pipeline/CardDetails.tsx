'use client';

import type { PipelineCard } from '@agora/contracts';
import { useId, useState } from 'react';
import s from './pipeline.module.css';

export interface SaveResult {
  ok: boolean;
  /** Mensagem do servidor quando recusou (ex.: conflito de versão). O texto da pessoa é mantido. */
  message?: string;
}

/**
 * Responsável e notas do card, abertos pelo menu "⋯". O rascunho de texto vive aqui: se o servidor recusar
 * (conflito de versão), o que a pessoa escreveu continua na tela e o card é recarregado por fora.
 */
export function CardDetails({
  card,
  onSave,
  onClose,
}: {
  card: PipelineCard;
  onSave: (patch: { assignee?: string | null; notes?: string | null }) => Promise<SaveResult>;
  onClose: () => void;
}) {
  const id = useId();
  const [assignee, setAssignee] = useState(card.assignee ?? '');
  const [notes, setNotes] = useState(card.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

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
    <div className={s.panel}>
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
        <button type="button" className="rg-btn wk-sm" onClick={onClose}>
          Fechar
        </button>
        <span className={s.saved} role="status" aria-live="polite">
          {msg?.kind === 'ok' && !dirty ? msg.text : dirty ? 'Alterações não salvas' : ''}
        </span>
      </div>
    </div>
  );
}
