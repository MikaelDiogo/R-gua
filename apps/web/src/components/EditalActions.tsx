'use client';

import type { PipelineCard, ProcurementDocument } from '@agora/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { useAnalyzed } from '@/lib/analyzed';
import { api, newKey, problemText } from '@/lib/api';
import { safeHref } from '@/lib/format';
import s from './edital/edital.module.css';
import { ReadPdfButton } from './edital/ReadPdfButton';
import { Icon } from './Icon';

/**
 * Antes da leitura, a ação principal é "Vou disputar" (leva o edital para o funil); depois que a IA leu o edital,
 * "Gerar proposta" passa a ser a principal. Só uma ação principal por vez (docs/design/DESIGN.md).
 */
export function EditalActions({
  procurementId,
  sourceUrl,
  documents,
}: {
  procurementId: string;
  sourceUrl: string | null;
  /** Documentos já coletados; `null` se ainda não foram. */
  documents: ProcurementDocument[] | null;
}) {
  const analyzed = useAnalyzed(procurementId);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    const r = await api<PipelineCard>('/pipeline/cards', {
      method: 'POST',
      headers: { 'Idempotency-Key': newKey() },
      body: { procurement_id: procurementId },
    });
    setBusy(false);
    if (r.ok) setDone(true);
    else {
      const m = problemText(r);
      setError(`${m.title} ${m.detail}`.trim());
    }
  }

  const sourceHref = sourceUrl ? safeHref(sourceUrl) : null;
  const funnelCls = analyzed ? 'rg-btn' : 'rg-btn rg-btn-primary';
  const proposalCls = analyzed ? 'rg-btn rg-btn-primary' : 'rg-btn';
  const proposalHref = `/propostas/nova?edital=${encodeURIComponent(procurementId)}`;

  return (
    <div className={s.actions}>
      {analyzed ? (
        <Link className={proposalCls} href={proposalHref}>
          <Icon name="doc" size={14} /> Gerar proposta
        </Link>
      ) : null}
      {done ? (
        <Link className="rg-btn" href="/pipeline">
          <Icon name="check" size={14} /> No funil · abrir
        </Link>
      ) : (
        <button type="button" className={funnelCls} onClick={add} disabled={busy}>
          <Icon name="plus" size={14} /> {busy ? 'Salvando…' : 'Vou disputar'}
        </button>
      )}
      {analyzed ? null : (
        <Link className={proposalCls} href={proposalHref}>
          <Icon name="doc" size={14} /> Gerar proposta
        </Link>
      )}
      <ReadPdfButton procurementId={procurementId} documents={documents} />
      <Link className="rg-btn" href={`/precificador?edital=${encodeURIComponent(procurementId)}`}>
        Precificar
      </Link>
      <Link className="rg-btn" href={`/recursos/novo?edital=${encodeURIComponent(procurementId)}`}>
        Gerar recurso ou impugnação
      </Link>
      {sourceHref ? (
        <a className="rg-btn" href={sourceHref} target="_blank" rel="noopener noreferrer">
          Abrir no portal de origem <Icon name="external" size={14} />
        </a>
      ) : null}
      <span className={s.srOnly} role="status" aria-live="polite">
        {done ? 'Edital salvo no funil.' : ''}
      </span>
      {error ? (
        <span className={s.actionNote} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
