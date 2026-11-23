import '@/styles/work.css';
import type { LegalPiece } from '@agora/contracts';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { LegalPieceView } from '@/components/recursos/LegalPieceView';
import { PageHeader, StateBlock } from '@/components/ui';
import { api } from '@/lib/api';
import { failureOf } from '@/lib/failure';
import { KIND_LABEL } from '@/lib/legal';

export const metadata = { title: 'Peça · Régua' };
export const dynamic = 'force-dynamic';

export default async function PecaPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const r = await api<LegalPiece>(`/legal-pieces/${encodeURIComponent(id)}`);
  const crumb = (
    <Link href="/recursos" className="wk-back">
      <Icon name="arrowLeft" size={14} /> Recursos e impugnações
    </Link>
  );

  if (!r.ok) {
    if (r.status === 404 || r.problem?.code === 'not_found') notFound();
    const f = failureOf(r);
    return (
      <>
        <PageHeader title="Peça" crumb={crumb} />
        <StateBlock
          kind="error"
          title={f.title}
          action={
            <Link href={`/recursos/${encodeURIComponent(id)}`} className="rg-btn wk-sm">
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
        title={KIND_LABEL[p.kind]}
        crumb={crumb}
        lead={`${p.organ_name} · ${p.procurement_object.length > 140 ? `${p.procurement_object.slice(0, 140)}…` : p.procurement_object}`}
      />
      <LegalPieceView initial={p} />
    </>
  );
}
