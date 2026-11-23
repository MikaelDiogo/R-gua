import '@/styles/work.css';
import type { MonitorList } from '@agora/contracts';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { EmailNotice } from '@/components/monitores/EmailNotice';
import { MonitorsList } from '@/components/monitores/MonitorsList';
import { Shortcuts } from '@/components/monitores/Shortcuts';
import { PageHeader, StateBlock } from '@/components/ui';
import { api, problemText } from '@/lib/api';

export const metadata = { title: 'Monitores · Régua' };
export const dynamic = 'force-dynamic';

const LEAD =
  'Um monitor vigia o PNCP por você e avisa em Alertas quando surge edital novo com o que você procura.';

export default async function MonitoresPage() {
  const r = await api<MonitorList>('/monitors');
  const create = (
    <Link href="/monitores/novo" className="rg-btn rg-btn-primary">
      <Icon name="plus" size={14} /> Criar monitor
    </Link>
  );

  if (!r.ok) {
    const msg = problemText(r);
    return (
      <>
        <PageHeader title="Monitores" lead={LEAD} actions={create} />
        <StateBlock
          kind="error"
          title={msg.title}
          action={
            <Link href="/monitores" className="rg-btn wk-sm">
              <Icon name="refresh" size={14} /> Tentar de novo
            </Link>
          }
        >
          {msg.detail}
        </StateBlock>
        <EmailNotice />
      </>
    );
  }

  const items = r.data.items;
  return (
    <>
      <PageHeader title="Monitores" lead={LEAD} stamp={r.data.server_now} actions={create} />
      {items.length === 0 ? (
        <>
          <StateBlock kind="empty" title="Você ainda não tem monitores.">
            Comece por um exemplo abaixo ou crie o seu. Você confere e ajusta antes de salvar.
          </StateBlock>
          <Shortcuts />
        </>
      ) : (
        <MonitorsList items={items} serverNow={r.data.server_now} />
      )}
      <EmailNotice />
    </>
  );
}
