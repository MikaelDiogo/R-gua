import '@/styles/work.css';
import Link from 'next/link';
import { MonitorWizard, type WizardInitial } from '@/components/monitores/MonitorWizard';
import { PageHeader } from '@/components/ui';
import { parseBRL } from '@/lib/money';

export const metadata = { title: 'Novo monitor · Régua' };

type Params = Record<string, string | string[] | undefined>;
const all = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const ymd = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

/** Da busca para o assistente: ?q=&uf=&orgao=&modalidade=&valor_min=&valor_max=&de=&ate=&abertas=. */
function initialFromParams(sp: Params): WizardInitial {
  const num = (v: string) =>
    v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : parseBRL(v);
  return {
    q: one(sp.q).slice(0, 500),
    uf: all(sp.uf),
    organs: all(sp.orgao).filter((c) => /^\d{14}$/.test(c)),
    modality: all(sp.modalidade)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 13),
    valueMin: num(one(sp.valor_min)),
    valueMax: num(one(sp.valor_max)),
    from: ymd(one(sp.de)),
    to: ymd(one(sp.ate)),
    onlyOpen: one(sp.abertas) !== '0',
  };
}

export default async function NovoMonitorPage({ searchParams }: { searchParams: Promise<Params> }) {
  const initial = initialFromParams(await searchParams);
  return (
    <>
      <PageHeader
        title="Novo monitor"
        lead="Diga o que você procura. Quando aparecer edital novo, o aviso chega em Alertas."
        crumb={<Link href="/monitores">Monitores</Link>}
      />
      <MonitorWizard initial={initial} />
    </>
  );
}
