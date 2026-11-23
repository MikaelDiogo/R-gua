import '@/styles/work.css';
import type { ProcurementDetail, ProposalList } from '@agora/contracts';
import Link from 'next/link';
import { EditalPicker } from '@/components/EditalPicker';
import { Icon } from '@/components/Icon';
import { NewProposal } from '@/components/propostas/NewProposal';
import { PageHeader, StateBlock } from '@/components/ui';
import { api } from '@/lib/api';
import { failureOf } from '@/lib/failure';

export const metadata = { title: 'Nova proposta · Régua' };
export const dynamic = 'force-dynamic';

const crumb = (
  <Link href="/propostas" className="wk-back">
    <Icon name="arrowLeft" size={14} /> Propostas
  </Link>
);

export default async function NovaPropostaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).edital;
  const id = Array.isArray(raw) ? raw[0] : raw;

  if (!id) {
    return (
      <>
        <PageHeader title="Nova proposta" crumb={crumb} lead="Escolha o edital da proposta." />
        <EditalPicker target="/propostas/nova" title="Qual edital?" />
      </>
    );
  }

  const [d, list] = await Promise.all([
    api<ProcurementDetail>(`/procurements/${encodeURIComponent(id)}`),
    api<ProposalList>('/proposals'),
  ]);
  const existing = list.ok
    ? list.data.items
        .filter((x) => x.procurement_id === id)
        .map((x) => ({ id: x.id, total: x.total, updated_at: x.updated_at }))
    : [];

  if (!d.ok) {
    const f = failureOf(d);
    return (
      <>
        <PageHeader title="Nova proposta" crumb={crumb} />
        <StateBlock
          kind="error"
          title={f.title}
          action={
            <Link
              href={`/propostas/nova?edital=${encodeURIComponent(id)}`}
              className="rg-btn wk-sm"
            >
              <Icon name="refresh" size={14} /> Tentar de novo
            </Link>
          }
        >
          {f.detail}
        </StateBlock>
        <EditalPicker target="/propostas/nova" title="Escolher outro edital" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Nova proposta"
        crumb={crumb}
        lead="Informe o seu preço por item e gere o rascunho."
      />
      <NewProposal edital={d.data} existing={existing} />
    </>
  );
}
