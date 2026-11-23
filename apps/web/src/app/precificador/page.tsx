import '@/styles/work.css';
import type { ProcurementDetail } from '@agora/contracts';
import Link from 'next/link';
import { EditalPicker } from '@/components/EditalPicker';
import { Icon } from '@/components/Icon';
import { MarginSimulator } from '@/components/precificador/MarginSimulator';
import { PricingView } from '@/components/precificador/PricingView';
import { PageHeader, StateBlock } from '@/components/ui';
import { api } from '@/lib/api';
import { failureOf } from '@/lib/failure';

export const metadata = { title: 'Precificador · Régua' };
export const dynamic = 'force-dynamic';

const LEAD = 'Faixa de preço por item e simulação de margem. O servidor faz as contas.';

export default async function PrecificadorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).edital;
  const id = Array.isArray(raw) ? raw[0] : raw;

  if (!id) {
    return (
      <>
        <PageHeader title="Precificador" lead={LEAD} />
        <EditalPicker target="/precificador" title="Escolha o edital para ver a faixa de preço" />
        <MarginSimulator />
      </>
    );
  }

  const d = await api<ProcurementDetail>(`/procurements/${encodeURIComponent(id)}`);
  if (!d.ok) {
    const f = failureOf(d);
    return (
      <>
        <PageHeader title="Precificador" lead={LEAD} />
        <StateBlock
          kind="error"
          title={f.title}
          action={
            <Link href={`/precificador?edital=${encodeURIComponent(id)}`} className="rg-btn wk-sm">
              <Icon name="refresh" size={14} /> Tentar de novo
            </Link>
          }
        >
          {f.detail}
        </StateBlock>
        <EditalPicker target="/precificador" title="Escolher outro edital" />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Precificador" lead={LEAD} />
      <PricingView edital={d.data} />
    </>
  );
}
