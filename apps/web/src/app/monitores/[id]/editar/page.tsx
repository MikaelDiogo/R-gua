import '@/styles/work.css';
import type { MonitorDetail } from '@agora/contracts';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { initialFromMonitor, MonitorWizard } from '@/components/monitores/MonitorWizard';
import { PageHeader, StateBlock } from '@/components/ui';
import { api, problemText } from '@/lib/api';

export const metadata = { title: 'Editar monitor · Régua' };
export const dynamic = 'force-dynamic';

export default async function EditarMonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = /^[0-9a-f-]{36}$/i.test(id)
    ? await api<MonitorDetail>(`/monitors/${id}?page=1&limit=20`)
    : null;

  if (!r?.ok) {
    const msg = r
      ? problemText(r)
      : { title: 'Monitor não encontrado.', detail: 'O link está incorreto.' };
    return (
      <>
        <PageHeader title="Editar monitor" crumb={<Link href="/monitores">Monitores</Link>} />
        <StateBlock
          kind="error"
          title={msg.title}
          action={
            <Link href="/monitores" className="btn secondary sm">
              <Icon name="arrowLeft" size={14} /> Ver monitores
            </Link>
          }
        >
          {msg.detail}
        </StateBlock>
      </>
    );
  }

  const m = r.data.monitor;
  return (
    <>
      <PageHeader
        title="Editar monitor"
        lead={m.name}
        crumb={<Link href={`/monitores/${m.id}`}>{m.name}</Link>}
      />
      <MonitorWizard monitor={m} initial={initialFromMonitor(m)} />
    </>
  );
}
