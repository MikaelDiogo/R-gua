'use client';

import type { AlertItem, PipelineCard } from '@agora/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { api, newKey, problemText } from '@/lib/api';
import { fmtBRL, readable, readableName } from '@/lib/format';
import { Icon } from '../Icon';
import { relativeDay } from '../monitores/format';
import { DeadlineRuler } from '../ui';
import s from './alertas.module.css';

/** Salvar no funil direto da lista (mesma chamada do detalhe do edital). */
export function PipelineButton({ procurementId }: { procurementId: string }) {
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

  return (
    <>
      {done ? (
        <Link className="wk-linkbtn" href="/pipeline">
          <Icon name="check" size={14} /> No funil · abrir
        </Link>
      ) : (
        <button type="button" className="wk-linkbtn" onClick={add} disabled={busy}>
          <Icon name="plus" size={14} /> {busy ? 'Salvando…' : 'Salvar no funil'}
        </button>
      )}
      {error ? (
        <span className={s.errorNote} role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}

/**
 * Um alerta em linha: o que é (Novo/Alterado), o edital, o prazo na régua e as ações.
 * `serverNow` vem do servidor: "hoje 09:12" nunca usa o relógio do aparelho.
 */
export function AlertCard({
  alert,
  showMonitor = true,
  onRead,
  readBusy = false,
  serverNow,
}: {
  alert: AlertItem;
  showMonitor?: boolean;
  onRead?: (id: string) => void;
  readBusy?: boolean;
  serverNow: string;
}) {
  const unread = !alert.read_at;
  const p = alert.procurement;
  return (
    <li className={s.alert} data-unread={unread || undefined}>
      <span className={s.unreadDot} role="img" aria-label={unread ? 'Não lido' : 'Lido'} />
      <div className={s.alertMain}>
        <div className={s.alertTop}>
          <span className={`rg-tag rg-tag-${alert.kind === 'new' ? 'accent' : 'warning'}`}>
            {alert.kind === 'new' ? 'Novo' : 'Alterado'}
          </span>
          <span className="rg-src rg-src-pncp">PNCP</span>
          {alert.change ? <span className={s.change}>{alert.change}</span> : null}
          <span className={s.meta}>
            {showMonitor ? (
              <>
                <Link href={`/monitores/${alert.monitor_id}`}>{alert.monitor_name}</Link> ·{' '}
              </>
            ) : null}
            {relativeDay(alert.created_at, serverNow)}
          </span>
        </div>
        <Link href={`/editais/${p.id}`} className={`${s.alertTitle} clamp3`}>
          {readable(p.object)}
        </Link>
        <p className={s.sub}>
          {readableName(p.organ.name)}
          {p.organ.uf ? ` · ${p.organ.uf}` : ''} · {p.modality.name}
          {p.estimated_value != null ? ` · ${fmtBRL(p.estimated_value)}` : ''}
        </p>
        <div className={s.itemActions}>
          <Link className="wk-linkbtn" href={`/editais/${p.id}`}>
            Abrir edital
          </Link>
          <PipelineButton procurementId={p.id} />
          {unread && onRead ? (
            <button
              type="button"
              className="wk-linkbtn"
              disabled={readBusy}
              onClick={() => onRead(alert.id)}
            >
              Marcar como lido
            </button>
          ) : null}
        </div>
      </div>
      <div className={s.alertRuler}>
        <DeadlineRuler deadline={p.deadline} mini today={serverNow} />
      </div>
    </li>
  );
}
