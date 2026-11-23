'use client';

import type { Monitor, MonitorDetail, RunMonitorResponse } from '@agora/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { failureOf } from '@/lib/failure';
import { fmtBRL, readableName } from '@/lib/format';
import { notifyAlertsChanged } from '@/lib/monitors';
import { usePaging } from '@/lib/paging';
import { AlertCard, PipelineButton } from '../alertas/AlertCard';
import alerts from '../alertas/alertas.module.css';
import { Icon } from '../Icon';
import { Pagination, RangeText } from '../Pagination';
import { DeadlineRuler, StateBlock } from '../ui';
import { isFixedMonitor, readable, relativeDay } from './format';
import { IntentParts } from './MonitorsList';
import s from './monitores.module.css';

const FREQ = { immediate: 'Avisa na hora', daily: 'Resumo diário' } as const;

/** Detalhe do monitor: situação e ações, o que há de novo desde a última visita e os editais que casam agora. */
export function MonitorView({ data }: { data: MonitorDetail }) {
  const router = useRouter();
  // A lista de editais pagina por ?page= e ?limit= (o servidor relê a página).
  const paging = usePaging({ page: 'page', size: 'limit' });
  const { monitor, unread_alerts: unread, matches } = data;
  const [busy, setBusy] = useState<'run' | 'toggle' | 'read' | 'delete' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const newIds = new Set(unread.map((a) => a.procurement.id));

  const fail = (r: Parameters<typeof failureOf>[0]) => {
    const f = failureOf(r);
    setError(`${f.title} ${f.detail}`.trim());
    if (f.code === 'version_conflict') router.refresh();
  };

  async function run() {
    setBusy('run');
    setMessage(null);
    setError(null);
    const r = await api<RunMonitorResponse>(`/monitors/${monitor.id}/run`, { method: 'POST' });
    setBusy(null);
    if (!r.ok) return fail(r);
    const { new_count: n, changed_count: c } = r.data;
    setMessage(
      n + c === 0
        ? 'Executado agora: nada novo desde a última vez.'
        : `Executado agora: ${n} ${n === 1 ? 'novo' : 'novos'}, ${c} ${c === 1 ? 'alterado' : 'alterados'}.`,
    );
    notifyAlertsChanged();
    router.refresh();
  }

  async function toggle() {
    setBusy('toggle');
    setError(null);
    const r = await api<Monitor>(`/monitors/${monitor.id}`, {
      method: 'PATCH',
      headers: { 'If-Match': String(monitor.version) },
      body: { active: !monitor.active },
    });
    setBusy(null);
    if (!r.ok) return fail(r);
    router.refresh();
  }

  async function markAllRead() {
    setBusy('read');
    setError(null);
    const r = await api<{ unread_total: number }>('/alerts/read', {
      method: 'POST',
      body: { ids: unread.map((a) => a.id) },
    });
    setBusy(null);
    if (!r.ok) return fail(r);
    notifyAlertsChanged();
    router.refresh();
  }

  async function remove() {
    setBusy('delete');
    setError(null);
    const r = await api<null>(`/monitors/${monitor.id}`, { method: 'DELETE' });
    setBusy(null);
    if (!r.ok) {
      setConfirming(false);
      return fail(r);
    }
    notifyAlertsChanged();
    router.push('/monitores');
    router.refresh();
  }

  const total = matches.meta.total_estimate;
  const pages = Math.max(1, Math.ceil(total / matches.page_size));
  const from = matches.items.length === 0 ? 0 : (matches.page - 1) * matches.page_size + 1;
  const to =
    matches.items.length === 0 ? 0 : (matches.page - 1) * matches.page_size + matches.items.length;
  const legsOk = matches.meta.legs.lexical === 'ok' || matches.meta.legs.lexical === 'skipped';

  return (
    <div className={s.stack}>
      <section className={s.detailHead} aria-label="Sobre este monitor">
        <div className={s.detailTags}>
          <span className={`rg-tag ${monitor.active ? 'rg-tag-success' : ''}`}>
            {monitor.active ? 'Ativo' : 'Pausado'}
          </span>
          {isFixedMonitor(monitor.name) ? (
            <span className={`rg-tag ${s.fixedTag}`} title="Criado pelo sistema">
              Fixo
            </span>
          ) : null}
          <span className={s.statusLine}>
            {FREQ[monitor.frequency]} · última execução:{' '}
            {relativeDay(monitor.last_run_at, data.server_now)}
          </span>
        </div>
        <p className={s.sectionHint}>O monitor procura por:</p>
        <IntentParts monitor={monitor} />
        <div className={s.detailActions}>
          <button
            type="button"
            className="rg-btn rg-btn-primary"
            onClick={run}
            disabled={busy !== null}
          >
            <Icon name="refresh" size={14} /> {busy === 'run' ? 'Executando…' : 'Executar agora'}
          </button>
          <Link className="rg-btn" href={`/monitores/${monitor.id}/editar`}>
            Editar
          </Link>
          <button type="button" className="rg-btn" onClick={toggle} disabled={busy !== null}>
            {busy === 'toggle' ? 'Salvando…' : monitor.active ? 'Pausar' : 'Ativar'}
          </button>
          <button
            type="button"
            className={`wk-linkbtn ${s.danger}`}
            onClick={() => setConfirming(true)}
            disabled={busy !== null}
          >
            Excluir
          </button>
        </div>

        {confirming ? (
          <div
            className="rg-banner rg-banner-warning"
            role="alertdialog"
            aria-label="Confirmar exclusão"
          >
            <div className="rg-banner-body">
              <p className="rg-banner-title">Excluir “{monitor.name}”?</p>
              <p>
                Os alertas dele também serão apagados.
                {isFixedMonitor(monitor.name)
                  ? ' Este monitor é fixo: o sistema o cria de novo no seu próximo login.'
                  : ''}
              </p>
            </div>
            <button type="button" className="rg-btn" onClick={remove} disabled={busy === 'delete'}>
              {busy === 'delete' ? 'Excluindo…' : 'Excluir'}
            </button>
            <button type="button" className="rg-btn" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </div>
        ) : null}

        {message ? (
          <p className={s.runResult} role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <StateBlock kind="error" title="Não foi possível concluir.">
            {error}
          </StateBlock>
        ) : null}
      </section>

      {unread.length > 0 ? (
        <section aria-labelledby="mon-new-h" className={s.stack}>
          <div className={s.sectionHead}>
            <h2 id="mon-new-h" className={s.sectionTitle}>
              Novos desde a última visita <span className="wk-num">({unread.length})</span>
            </h2>
            <button type="button" className="rg-btn" onClick={markAllRead} disabled={busy !== null}>
              {busy === 'read' ? 'Marcando…' : 'Marcar todos como lidos'}
            </button>
          </div>
          <ul className={alerts.list}>
            {unread.map((a) => (
              <AlertCard key={a.id} alert={a} showMonitor={false} serverNow={data.server_now} />
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="mon-match-h" className={s.stack}>
        <div className={s.sectionHead}>
          <h2 id="mon-match-h" className={s.sectionTitle}>
            Editais que casam agora
          </h2>
          <span className="wk-muted">
            <RangeText
              from={from}
              to={to}
              total={total}
              noun={total === 1 ? 'edital' : 'editais'}
            />
          </span>
        </div>

        {matches.items.length === 0 ? (
          <StateBlock
            kind={legsOk ? 'empty' : 'degraded'}
            title={legsOk ? 'Nenhum edital casa agora.' : 'A busca não respondeu por completo.'}
          >
            {legsOk
              ? 'Quando aparecer um edital que combine com este monitor, ele entra aqui e vira alerta.'
              : 'Isso não quer dizer que não existam editais. Tente executar de novo em instantes.'}
          </StateBlock>
        ) : (
          <>
            <div className={s.tableWrap}>
              <table className={`rg-table ${s.mtable} ${s.etable}`}>
                <thead>
                  <tr>
                    <th>Edital</th>
                    <th>UF</th>
                    <th className="rg-r">Valor</th>
                    <th>Propostas até</th>
                    <th>
                      <span className="wk-sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {matches.items.map((it) => (
                    <tr key={it.id}>
                      <td data-label="Edital">
                        <span className={s.editalLine}>
                          {newIds.has(it.id) ? (
                            <span className="rg-tag rg-tag-accent">Novo</span>
                          ) : null}
                          <Link href={`/editais/${it.id}`} className={`${s.monName} clamp3`}>
                            {readable(it.object)}
                          </Link>
                        </span>
                        <span className={s.sub}>
                          {readableName(it.organ.name)} · {it.modality.name}
                        </span>
                      </td>
                      <td data-label="UF">{it.organ.uf ?? '—'}</td>
                      <td className="rg-r" data-label="Valor">
                        {it.estimated_value != null ? (
                          fmtBRL(it.estimated_value)
                        ) : (
                          <span className="rg-muted" title="O órgão não informou o valor">
                            —
                          </span>
                        )}
                      </td>
                      <td data-label="Propostas até" className={s.rulerCell}>
                        <DeadlineRuler deadline={it.deadline} mini today={data.server_now} />
                      </td>
                      <td className={s.actionsCell}>
                        <Link className="wk-linkbtn" href={`/editais/${it.id}`}>
                          Abrir edital
                        </Link>
                        <PipelineButton procurementId={it.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              id="monitor"
              page={matches.page}
              pages={pages}
              perPage={matches.page_size}
              onPage={paging.setPage}
              onPerPage={paging.setPerPage}
              label="Paginação dos editais"
            />
          </>
        )}
      </section>
    </div>
  );
}
