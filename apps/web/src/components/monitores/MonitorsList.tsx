'use client';

import type { Monitor, MonitorDetail, RunMonitorResponse } from '@agora/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { failureOf } from '@/lib/failure';
import { fmtInt } from '@/lib/format';
import { intentParts, notifyAlertsChanged } from '@/lib/monitors';
import { useOrganNames } from '../SearchFilters';
import { isFixedMonitor, monitorTitle, relativeDay } from './format';
import s from './monitores.module.css';
import { RowMenu } from './RowMenu';

/** O que o monitor procura, em palavras: usa o nome do órgão quando já foi visto neste navegador. */
export function IntentParts({ monitor }: { monitor: Monitor }) {
  const names = useOrganNames(monitor.intent.filters.organ_cnpj ?? []);
  const parts = intentParts(monitor.intent, names);
  if (parts.length === 0) return <p className={s.note}>Todos os editais de Ceará e Piauí.</p>;
  return (
    <ul className={s.parts} aria-label="O que este monitor procura">
      {parts.map((p) => (
        <li key={p} className={s.part}>
          {p}
        </li>
      ))}
    </ul>
  );
}

type Count = number | 'loading' | 'failed';
type Notice = { kind: 'ok' | 'error'; text: string };

/**
 * Tabela de monitores. "Casam agora" vem do mesmo cálculo do detalhe (o servidor conta); se a leitura
 * falhar, mostra traço com o motivo, nunca zero.
 */
export function MonitorsList({ items, serverNow }: { items: Monitor[]; serverNow: string }) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, Count>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirm, setConfirm] = useState<Monitor | null>(null);

  const idsKey = useMemo(
    () => items.map((m) => `${m.id}:${m.version}:${m.last_run_at}`).join('|'),
    [items],
  );

  // Conta um monitor por vez (poucos e leves: limite 1): não sobrecarrega a API nem a base.
  // biome-ignore lint/correctness/useExhaustiveDependencies: idsKey representa a lista
  useEffect(() => {
    let alive = true;
    setCounts(Object.fromEntries(items.map((m) => [m.id, 'loading' as Count])));
    (async () => {
      for (const m of items) {
        const r = await api<MonitorDetail>(`/monitors/${m.id}?page=1&limit=1`);
        if (!alive) return;
        setCounts((c) => ({
          ...c,
          [m.id]: r.ok ? r.data.matches.meta.total_estimate : 'failed',
        }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [idsKey]);

  const fail = (r: Parameters<typeof failureOf>[0]) => {
    const f = failureOf(r);
    setNotice({ kind: 'error', text: `${f.title} ${f.detail}`.trim() });
    if (f.code === 'version_conflict') router.refresh();
  };

  async function run(m: Monitor) {
    setBusy(m.id);
    setNotice(null);
    const r = await api<RunMonitorResponse>(`/monitors/${m.id}/run`, { method: 'POST' });
    setBusy(null);
    if (!r.ok) return fail(r);
    const { new_count: n, changed_count: c } = r.data;
    setNotice({
      kind: 'ok',
      text:
        n + c === 0
          ? `${monitorTitle(m.name)}: nada novo desde a última execução.`
          : `${monitorTitle(m.name)}: ${n} ${n === 1 ? 'novo' : 'novos'}, ${c} ${c === 1 ? 'alterado' : 'alterados'}.`,
    });
    notifyAlertsChanged();
    router.refresh();
  }

  async function toggle(m: Monitor) {
    setBusy(m.id);
    setNotice(null);
    const r = await api<Monitor>(`/monitors/${m.id}`, {
      method: 'PATCH',
      headers: { 'If-Match': String(m.version) },
      body: { active: !m.active },
    });
    setBusy(null);
    if (!r.ok) return fail(r);
    router.refresh();
  }

  async function remove(m: Monitor) {
    setBusy(m.id);
    setNotice(null);
    const r = await api<null>(`/monitors/${m.id}`, { method: 'DELETE' });
    setBusy(null);
    setConfirm(null);
    if (!r.ok) return fail(r);
    notifyAlertsChanged();
    router.refresh();
  }

  const active = items.filter((m) => m.active).length;
  const unread = items.reduce((n, m) => n + m.unread, 0);
  const known = Object.values(counts).filter((c): c is number => typeof c === 'number');
  const pending = Object.values(counts).some((c) => c === 'loading');
  const failedSome = Object.values(counts).some((c) => c === 'failed');
  const sum = known.reduce((a, b) => a + b, 0);

  return (
    <div className={s.stack}>
      <section className="rg-kpis" aria-label="Resumo dos monitores">
        <div className="rg-kpi">
          <p className="rg-kpi-label">Monitores ativos</p>
          <p className="rg-kpi-value">{fmtInt(active)}</p>
          <p className="rg-kpi-note">
            {active === items.length
              ? 'Todos rodando'
              : `${fmtInt(items.length - active)} em pausa`}
          </p>
        </div>
        <div className="rg-kpi">
          <p className="rg-kpi-label">Editais que casam agora</p>
          <p className="rg-kpi-value">
            {pending && known.length === 0 ? (
              <span className="rg-muted" title="Contando…">
                —
              </span>
            ) : (
              fmtInt(sum)
            )}
          </p>
          <p className="rg-kpi-note">
            {failedSome
              ? 'Somando os que responderam; algum monitor não respondeu.'
              : 'Somando todos os monitores (um edital pode casar em mais de um).'}
          </p>
        </div>
        <div className="rg-kpi">
          <p className="rg-kpi-label">Alertas não lidos</p>
          <p className="rg-kpi-value">{fmtInt(unread)}</p>
          <p className="rg-kpi-note">
            {unread > 0 ? <Link href="/alertas">Ver em Alertas</Link> : 'Nada novo por ler'}
          </p>
        </div>
      </section>

      {notice ? (
        <div
          className={`rg-banner ${notice.kind === 'error' ? 'rg-banner-error' : ''}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          <div className="rg-banner-body">
            <p>{notice.text}</p>
          </div>
          <button type="button" className="rg-btn" onClick={() => setNotice(null)}>
            Fechar
          </button>
        </div>
      ) : null}

      {confirm ? (
        <div
          className="rg-banner rg-banner-warning"
          role="alertdialog"
          aria-label="Confirmar exclusão"
        >
          <div className="rg-banner-body">
            <p className="rg-banner-title">Excluir “{monitorTitle(confirm.name)}”?</p>
            <p>
              Os alertas dele também serão apagados.
              {isFixedMonitor(confirm.name)
                ? ' Este monitor é fixo: o sistema o cria de novo no seu próximo login.'
                : ''}
            </p>
          </div>
          <button
            type="button"
            className="rg-btn"
            onClick={() => remove(confirm)}
            disabled={busy === confirm.id}
          >
            {busy === confirm.id ? 'Excluindo…' : 'Excluir'}
          </button>
          <button type="button" className="rg-btn" onClick={() => setConfirm(null)}>
            Cancelar
          </button>
        </div>
      ) : null}

      <div className={s.tableWrap}>
        <table className={`rg-table ${s.mtable}`}>
          <thead>
            <tr>
              <th>Monitor</th>
              <th>Situação</th>
              <th className="rg-r">Casam agora</th>
              <th className="rg-r">Novos</th>
              <th>Última execução</th>
              <th>
                <span className="wk-sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => {
              const c = counts[m.id];
              const fixed = isFixedMonitor(m.name);
              return (
                <tr
                  key={m.id}
                  className={s.mrow}
                  data-paused={!m.active || undefined}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('a,button,[role="menu"]')) return;
                    router.push(`/monitores/${m.id}`);
                  }}
                >
                  <td data-label="Monitor">
                    <Link href={`/monitores/${m.id}`} className={s.monName}>
                      {monitorTitle(m.name)}
                    </Link>
                    <IntentParts monitor={m} />
                  </td>
                  <td data-label="Situação">
                    <span className={`rg-tag ${m.active ? 'rg-tag-success' : ''}`}>
                      {m.active ? 'Ativo' : 'Pausado'}
                    </span>
                    {fixed ? (
                      <span className={`rg-tag ${s.fixedTag}`} title="Criado pelo sistema">
                        Fixo
                      </span>
                    ) : null}
                  </td>
                  <td className="rg-r" data-label="Casam agora">
                    {typeof c === 'number' ? (
                      fmtInt(c)
                    ) : c === 'failed' ? (
                      <span className="rg-muted" title="Não foi possível contar agora">
                        —
                      </span>
                    ) : (
                      <span className="rg-muted" title="Contando…">
                        …
                      </span>
                    )}
                  </td>
                  <td className="rg-r" data-label="Novos">
                    {m.unread > 0 ? (
                      <span className="rg-tag rg-tag-accent">{fmtInt(m.unread)}</span>
                    ) : (
                      <span className="rg-muted">0</span>
                    )}
                  </td>
                  <td data-label="Última execução" className={s.when}>
                    {relativeDay(m.last_run_at, serverNow)}
                  </td>
                  <td className={s.actionsCell}>
                    <Link href={`/monitores/${m.id}`} className={`rg-btn ${s.openBtn}`}>
                      Abrir
                    </Link>
                    <RowMenu
                      label={`Mais ações de ${monitorTitle(m.name)}`}
                      items={[
                        {
                          key: 'run',
                          label: busy === m.id ? 'Executando…' : 'Executar agora',
                          disabled: busy !== null,
                          onSelect: () => run(m),
                        },
                        {
                          key: 'toggle',
                          label: m.active ? 'Pausar' : 'Ativar',
                          disabled: busy !== null,
                          onSelect: () => toggle(m),
                        },
                        { key: 'edit', label: 'Editar', href: `/monitores/${m.id}/editar` },
                        {
                          key: 'delete',
                          label: 'Excluir',
                          danger: true,
                          disabled: busy !== null,
                          onSelect: () => setConfirm(m),
                        },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
