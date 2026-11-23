'use client';

import type { AlertItem, AlertsResponse, Monitor } from '@agora/contracts';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { failureOf } from '@/lib/failure';
import { fmtDate } from '@/lib/format';
import { notifyAlertsChanged } from '@/lib/monitors';
import { usePaging } from '@/lib/paging';
import { Pagination, RangeText } from '../Pagination';
import { StateBlock } from '../ui';
import { AlertCard } from './AlertCard';
import s from './alertas.module.css';

/** "Hoje", "Ontem" ou a data. A comparação usa o relógio do servidor (`server_now`), nunca o do aparelho. */
function dayLabel(iso: string, nowIso: string): string {
  const d = fmtDate(iso);
  if (d === fmtDate(nowIso)) return 'Hoje';
  if (d === fmtDate(new Date(new Date(nowIso).getTime() - 86_400_000).toISOString()))
    return 'Ontem';
  return d;
}

function groupByMonitor(items: AlertItem[]): { label: string; items: AlertItem[] }[] {
  const map = new Map<string, { label: string; items: AlertItem[] }>();
  for (const it of items) {
    const g = map.get(it.monitor_id) ?? { label: it.monitor_name, items: [] };
    g.items.push(it);
    map.set(it.monitor_id, g);
  }
  return [...map.values()];
}

function groupByDay(items: AlertItem[], nowIso: string): { label: string; items: AlertItem[] }[] {
  const out: { label: string; items: AlertItem[] }[] = [];
  for (const it of items) {
    const label = dayLabel(it.created_at, nowIso);
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(it);
    else out.push({ label, items: [it] });
  }
  return out;
}

export function AlertsView({
  data,
  monitors,
  unreadOnly,
  monitorId,
}: {
  data: AlertsResponse;
  /** `null` se a lista de monitores não pôde ser lida (o filtro por monitor some, a lista continua). */
  monitors: Monitor[] | null;
  unreadOnly: boolean;
  monitorId: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const paging = usePaging();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<'dia' | 'monitor'>('dia');

  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    next.delete('pagina');
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    return qs ? `/alertas?${qs}` : '/alertas';
  };

  async function markRead(body: { ids?: string[]; all?: boolean }) {
    setBusy(true);
    setError(null);
    const r = await api<{ unread_total: number }>('/alerts/read', { method: 'POST', body });
    setBusy(false);
    if (!r.ok) {
      const f = failureOf(r);
      setError(`${f.title} ${f.detail}`.trim());
      return;
    }
    notifyAlertsChanged();
    router.refresh();
  }

  const unreadHere = data.items.filter((a) => !a.read_at).map((a) => a.id);
  const pages = Math.max(1, Math.ceil(data.total / data.page_size));
  const from = data.items.length === 0 ? 0 : (data.page - 1) * data.page_size + 1;
  const to = data.items.length === 0 ? 0 : (data.page - 1) * data.page_size + data.items.length;
  const groups =
    groupBy === 'dia' ? groupByDay(data.items, data.server_now) : groupByMonitor(data.items);

  return (
    <div className={s.stack}>
      <div className={s.toolbar}>
        <div className={s.filters}>
          <nav className={s.segment} aria-label="Quais alertas mostrar">
            <Link href={href({ todos: null })} aria-current={unreadOnly ? 'true' : undefined}>
              Não lidos
              {data.unread_total > 0 ? (
                <span className="wk-num"> ({data.unread_total})</span>
              ) : null}
            </Link>
            <Link href={href({ todos: '1' })} aria-current={unreadOnly ? undefined : 'true'}>
              Todos
            </Link>
          </nav>
          <fieldset className={s.segment} aria-label="Agrupar alertas">
            <button
              type="button"
              aria-pressed={groupBy === 'dia'}
              data-on={groupBy === 'dia' || undefined}
              onClick={() => setGroupBy('dia')}
            >
              Por dia
            </button>
            <button
              type="button"
              aria-pressed={groupBy === 'monitor'}
              data-on={groupBy === 'monitor' || undefined}
              onClick={() => setGroupBy('monitor')}
            >
              Por monitor
            </button>
          </fieldset>
          {monitors && monitors.length > 0 ? (
            <div className={s.monitorSelect}>
              <label htmlFor="alert-monitor">Monitor</label>
              <select
                id="alert-monitor"
                value={monitorId}
                onChange={(e) => router.push(href({ monitor: e.target.value || null }))}
              >
                <option value="">Todos os monitores</option>
                {monitors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        {unreadHere.length > 0 ? (
          <button
            type="button"
            className="rg-btn"
            disabled={busy}
            onClick={() => markRead(monitorId ? { ids: unreadHere } : { all: true })}
          >
            {monitorId ? 'Marcar desta página como lidos' : 'Marcar todos como lidos'}
          </button>
        ) : null}
      </div>

      {error ? (
        <StateBlock kind="error" title="Não foi possível marcar como lido.">
          {error}
        </StateBlock>
      ) : null}

      {data.items.length === 0 ? (
        <div className={s.empty}>
          <StateBlock
            kind="empty"
            title={unreadOnly ? 'Nenhum alerta novo.' : 'Nenhum alerta ainda.'}
            action={
              <Link
                href={monitors && monitors.length === 0 ? '/monitores/novo' : '/monitores'}
                className="rg-btn wk-sm"
              >
                {monitors && monitors.length === 0 ? 'Criar monitor' : 'Ver monitores'}
              </Link>
            }
          >
            {monitors && monitors.length === 0
              ? 'Crie um monitor com o que você procura: quando aparecer edital novo ou mudar um que você acompanha, ele avisa aqui.'
              : unreadOnly
                ? 'Quando um monitor achar edital novo ou mudança em um edital acompanhado, o aviso aparece aqui. Veja "Todos" para os já lidos.'
                : 'Os alertas aparecem quando um monitor achar edital novo ou mudança em um edital acompanhado.'}
          </StateBlock>
        </div>
      ) : (
        <>
          <p className="wk-muted">
            <RangeText from={from} to={to} total={data.total} noun="alertas" />
          </p>
          {groups.map((g) => (
            <section key={g.label} className={s.dayGroup} aria-label={g.label}>
              <h2 className={s.dayTitle}>
                {g.label} <span className="wk-num wk-muted">({g.items.length})</span>
              </h2>
              <ul className={s.list}>
                {g.items.map((a) => (
                  <AlertCard
                    key={a.id}
                    alert={a}
                    readBusy={busy}
                    serverNow={data.server_now}
                    showMonitor={groupBy === 'dia'}
                    onRead={(id) => markRead({ ids: [id] })}
                  />
                ))}
              </ul>
            </section>
          ))}
          <Pagination
            id="alertas"
            page={data.page}
            pages={pages}
            perPage={data.page_size}
            onPage={paging.setPage}
            onPerPage={paging.setPerPage}
            label="Paginação dos alertas"
          />
        </>
      )}
    </div>
  );
}
