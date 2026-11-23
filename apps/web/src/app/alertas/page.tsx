import '@/styles/work.css';
import type { AlertsResponse, MonitorList } from '@agora/contracts';
import Link from 'next/link';
import { AlertsView } from '@/components/alertas/AlertsView';
import { Icon } from '@/components/Icon';
import { PageHeader, StateBlock } from '@/components/ui';
import { api, problemText } from '@/lib/api';

export const metadata = { title: 'Alertas · Régua' };
export const dynamic = 'force-dynamic';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function AlertasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const unreadOnly = first(sp.todos) !== '1';
  const monitorId = /^[0-9a-f-]{36}$/i.test(first(sp.monitor)) ? first(sp.monitor) : '';
  const page = Math.min(100, Math.max(1, Number(first(sp.pagina)) || 1));
  const limit = Number(first(sp.por_pagina)) === 50 ? 50 : 20;

  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (unreadOnly) qs.set('unread', '1');
  if (monitorId) qs.set('monitor_id', monitorId);

  const [alerts, monitors] = await Promise.all([
    api<AlertsResponse>(`/alerts?${qs.toString()}`),
    api<MonitorList>('/monitors'),
  ]);

  const actions = (
    <Link href="/monitores" className="rg-btn">
      <Icon name="board" size={14} /> Meus monitores
    </Link>
  );

  if (!alerts.ok) {
    const msg = problemText(alerts);
    return (
      <>
        <PageHeader title="Alertas" actions={actions} />
        <StateBlock
          kind="error"
          title={msg.title}
          action={
            <Link href="/alertas" className="rg-btn wk-sm">
              <Icon name="refresh" size={14} /> Tentar de novo
            </Link>
          }
        >
          {msg.detail}
        </StateBlock>
      </>
    );
  }

  const unread = alerts.data.unread_total;
  return (
    <>
      <PageHeader
        title="Alertas"
        lead={
          unread > 0
            ? `${unread} ${unread === 1 ? 'alerta não lido' : 'alertas não lidos'}, de editais novos ou alterados.`
            : 'Editais novos ou alterados que os seus monitores encontraram.'
        }
        stamp={alerts.data.server_now}
        actions={actions}
      />
      <AlertsView
        data={alerts.data}
        monitors={monitors.ok ? monitors.data.items : null}
        unreadOnly={unreadOnly}
        monitorId={monitorId}
      />
    </>
  );
}
