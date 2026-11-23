import '@/styles/work.css';
import type { Proposal } from '@agora/contracts';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { ProposalEditor } from '@/components/propostas/ProposalEditor';
import { PageHeader, StateBlock } from '@/components/ui';
import { api } from '@/lib/api';
import { failureOf } from '@/lib/failure';

export const metadata = { title: 'Proposta · Régua' };
export const dynamic = 'force-dynamic';

export default async function PropostaPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const r = await api<Proposal>(`/proposals/${encodeURIComponent(id)}`);
  const crumb = (
    <Link href="/propostas" className="wk-back">
      <Icon name="arrowLeft" size={14} /> Propostas
    </Link>
  );

  if (!r.ok) {
    if (r.status === 404 || r.problem?.code === 'not_found') notFound();
    const f = failureOf(r);
    return (
      <>
        <PageHeader title="Proposta" crumb={crumb} />
        <StateBlock
          kind="error"
          title={f.title}
          action={
            <Link href={`/propostas/${encodeURIComponent(id)}`} className="rg-btn wk-sm">
              <Icon name="refresh" size={14} /> Tentar de novo
            </Link>
          }
        >
          {f.detail}
        </StateBlock>
      </>
    );
  }

  const p = r.data;
  return (
    <>
      <PageHeader
        title="Proposta"
        crumb={crumb}
        lead={`${p.organ_name} · ${p.procurement_object.length > 140 ? `${p.procurement_object.slice(0, 140)}…` : p.procurement_object}`}
      />
      <ProposalEditor initial={p} />
    </>
  );
}
