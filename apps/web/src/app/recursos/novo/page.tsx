import '@/styles/work.css';
import type { ProcurementDetail } from '@agora/contracts';
import Link from 'next/link';
import { EditalPicker } from '@/components/EditalPicker';
import { Icon } from '@/components/Icon';
import { NewLegalPiece } from '@/components/recursos/NewLegalPiece';
import { PageHeader, StateBlock } from '@/components/ui';
import { api } from '@/lib/api';
import { failureOf } from '@/lib/failure';
import { isKind } from '@/lib/legal';

export const metadata = { title: 'Nova peça · Régua' };
export const dynamic = 'force-dynamic';

const crumb = (
  <Link href="/recursos" className="wk-back">
    <Icon name="arrowLeft" size={14} /> Recursos e impugnações
  </Link>
);

export default async function NovaPecaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const rawId = sp.edital;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const rawKind = Array.isArray(sp.tipo) ? sp.tipo[0] : sp.tipo;

  if (!id) {
    return (
      <>
        <PageHeader title="Nova peça" crumb={crumb} lead="Escolha o edital da peça." />
        <EditalPicker target="/recursos/novo" title="Qual edital?" />
      </>
    );
  }

  const d = await api<ProcurementDetail>(`/procurements/${encodeURIComponent(id)}`);
  if (!d.ok) {
    const f = failureOf(d);
    return (
      <>
        <PageHeader title="Nova peça" crumb={crumb} />
        <StateBlock
          kind="error"
          title={f.title}
          action={
            <Link href={`/recursos/novo?edital=${encodeURIComponent(id)}`} className="rg-btn wk-sm">
              <Icon name="refresh" size={14} /> Tentar de novo
            </Link>
          }
        >
          {f.detail}
        </StateBlock>
        <EditalPicker target="/recursos/novo" title="Escolher outro edital" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Nova peça"
        crumb={crumb}
        lead="Em 3 passos: o tipo, o que aconteceu e o rascunho."
      />
      <NewLegalPiece edital={d.data} initialKind={isKind(rawKind) ? rawKind : null} />
    </>
  );
}
