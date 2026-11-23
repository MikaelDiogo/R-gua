import type { DashboardResponse, PipelineResponse } from '@agora/contracts';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Dash, DeadlineRuler, PageHeader, StateBlock } from '@/components/ui';
import { api, problemText } from '@/lib/api';
import { COVERAGE_LABEL } from '@/lib/coverage';
import { fmtBRL, fmtDate, fmtInt, readable, readableName } from '@/lib/format';

export const metadata = { title: 'Radar de oportunidades · Régua' };

/** Etapas em que há proposta em andamento (o servidor nomeia as etapas; a tela só conta os cartões). */
const WITH_PROPOSAL = ['em_preparacao', 'proposta_enviada', 'em_disputa'];

/** "2026-11-02" → "Semana de 02/11" (data civil, sem fuso). */
const weekLabel = (ymd: string) => {
  const [, m, d] = ymd.split('-');
  return `Semana de ${d}/${m}`;
};

export default async function Radar() {
  const [dash, pipe] = await Promise.all([
    api<DashboardResponse>('/dashboard'),
    api<PipelineResponse>('/pipeline'),
  ]);

  if (!dash.ok) {
    const msg = problemText(dash);
    return (
      <>
        <PageHeader title="Radar de oportunidades" />
        <StateBlock
          kind="error"
          title={msg.title}
          action={
            <Link href="/radar" className="rg-btn">
              <Icon name="refresh" size={14} /> Tentar de novo
            </Link>
          }
        >
          {msg.detail}
        </StateBlock>
      </>
    );
  }

  const d = dash.data;
  const inProposal = pipe.ok
    ? pipe.data.cards.filter((c) => WITH_PROPOSAL.includes(c.state)).length
    : null;
  const maxWeek = Math.max(1, ...d.closing_by_week.map((w) => w.count));
  const lead =
    d.open_total === 0
      ? 'Ainda não há editais coletados. Quando a coleta do PNCP rodar, eles aparecem aqui.'
      : `${fmtInt(d.open_total)} editais com propostas abertas em ${COVERAGE_LABEL}.`;

  return (
    <>
      <PageHeader
        title="Radar de oportunidades"
        lead={lead}
        stamp={d.server_now}
        actions={
          <Link href="/chat" className="btn secondary sm">
            <Icon name="chat" size={14} /> Perguntar no chat
          </Link>
        }
      />

      {!pipe.ok ? (
        <div className="radarBlock">
          <StateBlock kind="degraded" title="O funil não respondeu">
            Os números do funil aparecem como traço até a próxima leitura.
          </StateBlock>
        </div>
      ) : null}

      <div className="rg-kpis radarKpis">
        <div className="rg-kpi">
          <p className="rg-kpi-label">Novos hoje</p>
          <p className="rg-kpi-value">{fmtInt(d.published_today)}</p>
          <p className="rg-kpi-note">Publicados no PNCP hoje</p>
        </div>
        <div className="rg-kpi">
          <p className="rg-kpi-label">Vencem esta semana</p>
          <p className="rg-kpi-value">{fmtInt(d.closing_in_7_days)}</p>
          <p className="rg-kpi-note">Propostas até 7 dias</p>
        </div>
        <div className="rg-kpi">
          <p className="rg-kpi-label">Valor em propostas</p>
          <p className="rg-kpi-value">
            {d.proposals_value === null ? (
              <Dash why="Nenhum edital do seu funil em proposta tem valor estimado" />
            ) : (
              fmtBRL(d.proposals_value)
            )}
          </p>
          <p className="rg-kpi-note">
            {inProposal === null ? 'No seu funil' : `${fmtInt(inProposal)} no seu funil`}
          </p>
        </div>
      </div>

      <section className="radarBlock" aria-labelledby="soon-h">
        <div className="radarBlockHead">
          <h2 id="soon-h">Prazos mais próximos</h2>
          <Link href="/busca?prazo=7d&ordem=deadline_asc" className="linkBtn">
            Ver todos
          </Link>
        </div>
        {d.closing_soon.length === 0 ? (
          <div className="rg-empty">
            <div className="rg-empty-head">
              <span>Prazos mais próximos</span>
              <span className="num">0</span>
            </div>
            <div className="rg-empty-body">
              <p className="rg-empty-title">Sem editais novos com prazo se aproximando</p>
              <p>Abra o Buscador para ver tudo o que já foi coletado.</p>
              <Link href="/busca" className="btn secondary sm">
                Abrir o Buscador
              </Link>
            </div>
          </div>
        ) : (
          <ul className="radarList">
            {d.closing_soon.slice(0, 8).map((e) => (
              <li key={e.id} className="radarRow">
                <div>
                  <Link href={`/editais/${e.id}`} className="radarObj clamp3">
                    {readable(e.object)}
                  </Link>
                  <p className="radarMeta">
                    {readableName(e.organ.name)}
                    {e.organ.uf ? ` · ${e.organ.uf}` : ''} · {e.modality.name}
                  </p>
                </div>
                <div className="radarSide">
                  <span className="radarValue">
                    {e.estimated_value != null ? (
                      fmtBRL(e.estimated_value)
                    ) : (
                      <Dash why="Valor estimado não informado" />
                    )}
                  </span>
                  <DeadlineRuler deadline={e.deadline} mini />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="radarBlock">
        <section className="panel" aria-labelledby="weeks-h">
          <div className="panelHead">
            <h2 id="weeks-h">Encerramentos por semana</h2>
          </div>
          {d.closing_by_week.length === 0 ? (
            <p className="mutedInline">Sem editais abertos para mostrar.</p>
          ) : (
            <ul className="radarWeeks">
              {d.closing_by_week.map((w) => (
                <li key={w.week_start}>
                  <span className="radarMeta">{weekLabel(w.week_start)}</span>
                  <span className="radarWeekTrack" aria-hidden="true">
                    <span
                      className="radarWeekFill"
                      style={{ width: `${(w.count / maxWeek) * 100}%` }}
                    />
                  </span>
                  <span className="num">{fmtInt(w.count)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="radarNote">Editais com propostas abertas, por semana de encerramento.</p>
        </section>

        <section className="panel" aria-labelledby="base-h">
          <div className="panelHead">
            <h2 id="base-h">O que já foi coletado</h2>
          </div>
          <p className="radarNote">
            A Régua mostra só o que já coletou do PNCP: {fmtInt(d.coverage.procurements_stored)}{' '}
            editais
            {d.coverage.oldest_published_at
              ? `, o mais antigo publicado em ${fmtDate(d.coverage.oldest_published_at)}`
              : ''}
            . Editais fora dessa base não aparecem na busca.
          </p>
        </section>
      </div>
    </>
  );
}
