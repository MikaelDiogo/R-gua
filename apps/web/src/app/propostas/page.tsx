import '@/styles/work.css';
import type { ProposalList } from '@agora/contracts';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { ProposalsList } from '@/components/propostas/ProposalsList';
import { PageHeader, StateBlock } from '@/components/ui';
import { api } from '@/lib/api';
import { failureOf } from '@/lib/failure';

export const metadata = { title: 'Propostas · Régua' };
export const dynamic = 'force-dynamic';

export default async function PropostasPage() {
  const r = await api<ProposalList>('/proposals');

  return (
    <>
      <PageHeader
        title="Propostas"
        lead="Rascunhos de proposta gerados a partir dos editais, com os seus preços."
        stamp={r.ok ? r.data.server_now : null}
        actions={
          <Link href="/busca" className="rg-btn rg-btn-primary">
            <Icon name="search" size={14} /> Buscar um edital
          </Link>
        }
      />

      {!r.ok ? (
        <StateBlock
          kind="error"
          title={failureOf(r).title}
          action={
            <Link href="/propostas" className="rg-btn wk-sm">
              <Icon name="refresh" size={14} /> Tentar de novo
            </Link>
          }
        >
          {failureOf(r).detail}
        </StateBlock>
      ) : r.data.items.length === 0 ? (
        <StateBlock
          kind="empty"
          title="Você ainda não tem propostas."
          action={
            <Link href="/busca" className="rg-btn rg-btn-primary wk-sm">
              Buscar editais
            </Link>
          }
        >
          Abra um edital e clique em Gerar proposta.
        </StateBlock>
      ) : (
        <ProposalsList items={r.data.items} />
      )}
    </>
  );
}
