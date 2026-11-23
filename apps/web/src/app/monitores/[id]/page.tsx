import '@/styles/work.css';
import type { MonitorDetail } from '@agora/contracts';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { MonitorView } from '@/components/monitores/MonitorView';
import { PageHeader, StateBlock } from '@/components/ui';
import { api, problemText } from '@/lib/api';

export const metadata = { title: 'Monitor · Régua' };
export const dynamic = 'force-dynamic';

export default async function MonitorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const page = Math.min(100, Math.max(1, Number(first(sp.page)) || 1));
  const limit = Number(first(sp.limit)) === 50 ? 50 : 20;

  const crumb = <Link href="/monitores">Monitores</Link>;
  const r = /^[0-9a-f-]{36}$/i.test(id)
    ? await api<MonitorDetail>(`/monitors/${id}?page=${page}&limit=${limit}`)
    : null;

  if (!r?.ok) {
    const msg = r
      ? problemText(r)
      : { title: 'Monitor não encontrado.', detail: 'O link está incorreto.' };
    return (
      <>
        <PageHeader title="Monitor" crumb={crumb} />
        <StateBlock
          kind="error"
          title={msg.title}
          action={
            <Link href={r ? `/monitores/${id}` : '/monitores'} className="rg-btn wk-sm">
              <Icon name="refresh" size={14} /> {r ? 'Tentar de novo' : 'Ver monitores'}
            </Link>
          }
        >
          {msg.detail}
        </StateBlock>
      </>
    );
  }

  return (
    <>
      <PageHeader title={r.data.monitor.name} crumb={crumb} stamp={r.data.server_now} />
      <MonitorView data={r.data} />
    </>
  );
}
