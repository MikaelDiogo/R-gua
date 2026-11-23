import type { ProcurementDetail } from '@agora/contracts';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EditalActions } from '@/components/EditalActions';
import { EditalTabs } from '@/components/EditalTabs';
import s from '@/components/edital/edital.module.css';
import { Icon } from '@/components/Icon';
import { QualityFlags } from '@/components/ResultCard';
import { DeadlineRuler, PageHeader } from '@/components/ui';
import { api, problemText } from '@/lib/api';
import { fmtBRL, fmtDateTime, readable, readableName } from '@/lib/format';
import '@/styles/regua.css';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const r = await api<ProcurementDetail>(`/procurements/${encodeURIComponent((await params).id)}`);
  return {
    title: r.ok
      ? `${r.data.edital_number ?? 'Edital'} · ${r.data.organ.name} · Régua`
      : 'Edital · Régua',
  };
}

const Back = () => (
  <Link href="/busca" className={s.back}>
    <Icon name="arrowLeft" size={14} /> Buscador
  </Link>
);

/** Avisos do topo da tela: tudo vem do servidor (situação, prazo e qualidade do dado). */
function Notices({ e }: { e: ProcurementDetail }) {
  const datesOff =
    e.quality_flags.includes('date_suspect') || e.quality_flags.includes('proposal_dates_inverted');
  return (
    <>
      {e.status === 'canceled' ? (
        <div className="rg-banner rg-banner-error" role="status">
          <div className="rg-banner-body">
            <p className="rg-banner-title">Edital revogado</p>
            <p>O órgão revogou este edital no PNCP. Não há prazo para propostas.</p>
          </div>
        </div>
      ) : null}
      {e.status === 'suspended' ? (
        <div className="rg-banner rg-banner-warning" role="status">
          <div className="rg-banner-body">
            <p className="rg-banner-title">Edital suspenso</p>
            <p>
              O órgão suspendeu este edital. Confira no portal de origem antes de preparar a
              proposta.
            </p>
          </div>
        </div>
      ) : null}
      {datesOff ? (
        <div className="rg-banner rg-banner-warning" role="status">
          <div className="rg-banner-body">
            <p className="rg-banner-title">Edital possivelmente alterado</p>
            <p>As datas informadas parecem incorretas. Confira o prazo no portal de origem.</p>
          </div>
        </div>
      ) : null}
      {e.deadline.level === 'closed' && e.status !== 'canceled' ? (
        <div className="rg-banner rg-banner-warning" role="status">
          <div className="rg-banner-body">
            <p className="rg-banner-title">Prazo encerrado</p>
            <p>{e.deadline.label}. Você ainda pode ler o edital e acompanhar o resultado.</p>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default async function EditalPage({ params }: Props) {
  const id = (await params).id;
  const r = await api<ProcurementDetail>(`/procurements/${encodeURIComponent(id)}`);

  if (!r.ok) {
    if (r.status === 404 || r.problem?.code === 'not_found') notFound();
    const m = problemText(r);
    return (
      <>
        <PageHeader title="Edital" crumb={<Back />} />
        <div className="rg-banner rg-banner-error" role="alert">
          <div className="rg-banner-body">
            <p className="rg-banner-title">{m.title}</p>
            <p>{m.detail}</p>
          </div>
          <Link href={`/editais/${encodeURIComponent(id)}`} className="rg-btn">
            <Icon name="refresh" size={14} /> Tentar de novo
          </Link>
        </div>
      </>
    );
  }

  const e = r.data;
  const place = [e.organ.municipality, e.organ.uf].filter(Boolean).join(' · ');
  const title = e.edital_number
    ? `${e.modality.name} ${e.edital_number}/${e.year}`
    : e.numero_controle_pncp;

  return (
    <>
      <PageHeader
        title={title}
        crumb={<Back />}
        lead={`${readableName(e.organ.name)}${place ? ` · ${place}` : ''}`}
        actions={
          <EditalActions
            procurementId={e.id}
            sourceUrl={e.origin_url ?? e.source_url}
            documents={e.documents.collected ? e.documents.list : null}
          />
        }
      />
      <Notices e={e} />

      <section className={s.object} aria-labelledby="obj-h">
        <h2 id="obj-h" className={s.sectionTitle}>
          Objeto
        </h2>
        <p className={s.objectText}>{readable(e.object)}</p>
        <div className={s.tags}>
          {e.status === 'canceled' ? <span className="rg-tag rg-tag-error">Revogado</span> : null}
          {e.status === 'suspended' ? (
            <span className="rg-tag rg-tag-warning">Suspenso</span>
          ) : null}
          {e.status === 'closed' ? <span className="rg-tag">Encerrado</span> : null}
          {e.srp ? <span className="rg-tag">Registro de preços</span> : null}
          <QualityFlags flags={e.quality_flags} />
        </div>
      </section>

      <dl className={s.kpis}>
        <div className={s.kpi}>
          <dt>Valor estimado</dt>
          <dd>
            {e.estimated_value != null ? (
              fmtBRL(e.estimated_value)
            ) : (
              <span className={s.dash} role="img" aria-label="Valor não informado">
                —
              </span>
            )}
          </dd>
        </div>
        <div className={`${s.kpi} ${s.rulerCell}`}>
          <dt>Propostas até</dt>
          <dd>
            <DeadlineRuler deadline={e.deadline} />
          </dd>
        </div>
        <div className={s.kpi}>
          <dt>Situação</dt>
          <dd>
            {e.status_raw}
            {e.published_at ? (
              <span className={s.kpiSub}>publicado em {fmtDateTime(e.published_at)}</span>
            ) : null}
          </dd>
        </div>
      </dl>

      <EditalTabs edital={e} />
    </>
  );
}
