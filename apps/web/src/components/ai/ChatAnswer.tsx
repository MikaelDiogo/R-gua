'use client';

import type {
  AiRanked,
  AiSearchResponse,
  CriterionStatus,
  PipelineCard,
  ProcurementSummary,
} from '@agora/contracts';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, newKey, problemText } from '@/lib/api';
import { ufName } from '@/lib/coverage';
import { fmtBRL, fmtDate, readable } from '@/lib/format';
import { ReadPdfButton } from '../edital/ReadPdfButton';
import s from './chat.module.css';

/** Quantos cartões da base aparecem antes de "Ver mais". */
const PAGE_SIZE = 10;
const MAX_WEB_SOURCES = 3;

type Situation = 'all' | 'open' | 'ongoing';
type Fit = 'all' | 'meets' | 'partial' | 'missing';
type FitBand = Exclude<Fit, 'all'>;
type WebItem = AiSearchResponse['web_opportunities'][number];
type Proc = ProcurementSummary;

/** Em vigor = propostas ainda abertas. O resto (encerrado, em julgamento, suspenso...) é "em andamento / encerrados". */
const isInForce = (p: Proc) => p.status === 'open_for_proposals' && p.deadline.level !== 'closed';
const matchSituation = (p: Proc, sit: Situation) =>
  sit === 'all' || (sit === 'open') === isInForce(p);

/** Faixas da nota (já calculada no servidor): só agrupam, nada é recalculado aqui. */
const fitOf = (score: number): FitBand =>
  score >= 60 ? 'meets' : score < 40 ? 'missing' : 'partial';
const FIT_LABEL: Record<FitBand, string> = {
  meets: 'Atende',
  partial: 'Atende em parte',
  missing: 'Não atende',
};
const FIT_TAG: Record<FitBand, string> = {
  meets: 'rg-tag-success',
  partial: 'rg-tag-warning',
  missing: 'rg-tag-error',
};
const matchFit = (score: number, fit: Fit) => fit === 'all' || fitOf(score) === fit;

const CRITERION: Record<CriterionStatus, { text: string; tag: string }> = {
  meets: { text: 'Atende', tag: 'rg-tag-success' },
  partial: { text: 'Atende em parte', tag: 'rg-tag-warning' },
  missing: { text: 'Não atende', tag: 'rg-tag-error' },
  unknown: { text: 'Não consta', tag: '' },
};

const VERDICT: Record<AiRanked['verdict'], string> = {
  best: 'Melhor opção',
  good: 'Boa opção',
  maybe: 'Talvez',
};

const DEGRADED_TEXT: Record<string, string> = {
  nl_understanding: 'Não consegui interpretar o pedido; busquei pelo texto exato.',
  semantic: 'A busca por sentido está indisponível; usei só as palavras.',
  rerank: 'A reordenação dos resultados está indisponível.',
  filters_relaxed:
    'Nada combinava com todos os filtros; afrouxei os filtros para trazer resultados.',
};

/** Só abre links http(s): a URL vem de um buscador externo e nunca deve virar `javascript:` ou similar. */
const safeHttp = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
};

/**
 * Régua de prazo mini: a barra vai de hoje até o encerramento, em uma faixa de 14 dias. Os dias vêm do servidor
 * (`calendar_days`); aqui só se desenha. Até 3 dias a barra fica em warning; encerrado vira texto em error.
 */
function MiniRuler({ deadline }: { deadline: Proc['deadline'] }) {
  const days = deadline.calendar_days;
  if (deadline.level === 'closed') {
    return (
      <div style={{ flex: 1, minWidth: 140 }}>
        <div className="rg-ruler rg-ruler-mini" role="img" aria-label={deadline.label}>
          <div className="rg-ruler-row">
            <div className="rg-ruler-today" style={{ background: 'var(--error)' }} />
          </div>
        </div>
        <div className="rg-ruler-cap" style={{ color: 'var(--error)' }}>
          <span>{deadline.label}</span>
        </div>
      </div>
    );
  }
  if (days === null || deadline.level === 'unknown') {
    return (
      <div style={{ flex: 1, minWidth: 140 }}>
        <span className="rg-absent" title="O órgão não informou o prazo de propostas">
          — <span className="rg-muted">prazo não informado</span>
        </span>
      </div>
    );
  }
  const width = `calc(100% / 14 * ${Math.max(0, Math.min(days, 14))})`;
  const capText = days === 0 ? 'hoje' : days === 1 ? 'em 1 dia' : `em ${days} dias`;
  return (
    <div style={{ flex: 1, minWidth: 140 }}>
      <div className="rg-ruler rg-ruler-mini" role="img" aria-label={deadline.label}>
        <div className="rg-ruler-row">
          <div
            className="rg-ruler-bar"
            data-tone={days <= 3 ? 'warning' : undefined}
            style={{ width }}
          />
          <div className="rg-ruler-today" />
        </div>
      </div>
      <div className="rg-ruler-cap">
        <span>hoje</span>
        <span>{days > 14 ? `em ${days} dias` : capText}</span>
      </div>
    </div>
  );
}

function StatusTags({ p }: { p: Proc }) {
  const flags = p.quality_flags;
  return (
    <>
      {isInForce(p) ? <span className="rg-tag rg-tag-success">Em vigor</span> : null}
      {p.status === 'closed' || (p.status === 'open_for_proposals' && !isInForce(p)) ? (
        <span className="rg-tag">Encerrado</span>
      ) : null}
      {p.status === 'canceled' ? <span className="rg-tag rg-tag-error">Revogado</span> : null}
      {p.status === 'suspended' ? <span className="rg-tag rg-tag-warning">Suspenso</span> : null}
      {flags.includes('value_missing') || flags.includes('value_suspect') ? (
        <span
          className="rg-tag rg-tag-warning"
          title="O órgão não informou o valor estimado, ou ele parece incorreto"
        >
          Valor não confiável
        </span>
      ) : null}
      {flags.includes('date_suspect') || flags.includes('proposal_dates_inverted') ? (
        <span
          className="rg-tag rg-tag-warning"
          title="As datas do edital parecem incorretas. Confira no PNCP"
        >
          Datas suspeitas
        </span>
      ) : null}
    </>
  );
}

/** "O que atende e o que não atende": os critérios do pedido, iguais para a base e para a web. */
function Criteria({
  criteria,
  unknownText,
}: {
  criteria: AiRanked['criteria'];
  unknownText: string;
}) {
  if (criteria.length === 0) return null;
  return (
    <div className={s.block}>
      <h4 className={s.blockTitle}>O que atende e o que não atende</h4>
      <ul className={s.criteria}>
        {criteria.map((c) => {
          const st = CRITERION[c.status];
          return (
            <li key={c.name}>
              <span>{c.name}</span>
              <span className={`rg-tag ${st.tag}`}>
                {c.status === 'unknown' ? unknownText : st.text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Bullets({ title, items, concern }: { title: string; items: string[]; concern?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className={s.block}>
      <h4 className={s.blockTitle}>{title}</h4>
      <ul className={s.bullets} data-concern={concern ? '' : undefined}>
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

/** Salvar no funil: cria o cartão no pipeline (idempotente). A resposta do servidor é quem diz que salvou. */
function SaveToPipeline({ procurementId }: { procurementId: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const r = await api<PipelineCard>('/pipeline/cards', {
      method: 'POST',
      headers: { 'Idempotency-Key': newKey() },
      body: { procurement_id: procurementId },
    });
    setBusy(false);
    if (r.ok) setDone(true);
    else {
      const m = problemText(r);
      setError(`${m.title} ${m.detail}`.trim());
    }
  }

  return (
    <>
      {done ? (
        <Link className="rg-btn" href="/pipeline">
          Abrir no funil
        </Link>
      ) : (
        <button type="button" className="rg-btn rg-btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar no funil'}
        </button>
      )}
      <span className="rg-muted" role="status" aria-live="polite" style={{ fontSize: 12 }}>
        {done ? 'Salvo no funil.' : ''}
      </span>
      {error ? (
        <span className={s.err} role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}

function Figures({ p, score }: { p: Proc; score?: number }) {
  return (
    <div className="rg-edital-figs">
      <div>
        <div className="rg-fig-label">Valor estimado</div>
        <div className="rg-fig">
          {p.estimated_value != null ? (
            fmtBRL(p.estimated_value)
          ) : (
            <span className="rg-absent" title="O órgão não informou o valor">
              —
            </span>
          )}
        </div>
      </div>
      <div>
        <div className="rg-fig-label">Propostas até</div>
        <div className="rg-fig">
          {p.proposals_close_at ? (
            fmtDate(p.proposals_close_at)
          ) : (
            <span className="rg-absent" title="O órgão não informou o prazo">
              —
            </span>
          )}
        </div>
      </div>
      {score !== undefined ? (
        <div>
          <div className="rg-fig-label">Compatibilidade</div>
          <div className="rg-match" title="Nota calculada no servidor a partir dos critérios">
            {score}%
          </div>
        </div>
      ) : null}
      <MiniRuler deadline={p.deadline} />
    </div>
  );
}

function RankedCard({ r, cite }: { r: AiRanked; cite: (url: string) => number | undefined }) {
  const p = r.procurement;
  const place = [p.organ.municipality, p.organ.uf].filter(Boolean).join(' ');
  const band = fitOf(r.score);
  const sources = r.web_sources
    .map((w) => ({ ...w, href: safeHttp(w.url) }))
    .filter((w): w is typeof w & { href: string } => w.href !== null)
    .slice(0, MAX_WEB_SOURCES);
  return (
    <li className={`rg-card rg-edital ${s.card}`} id={`melhor-${r.rank}`}>
      <div className="rg-edital-head">
        <div>
          <div className={s.tags}>
            <span className={s.rankNo}>
              <span className={s.sr}>Posição </span>#{r.rank}
            </span>
            <span className={`rg-tag ${FIT_TAG[band]}`}>{FIT_LABEL[band]}</span>
            <span className="rg-tag rg-tag-accent">{VERDICT[r.verdict]}</span>
            <StatusTags p={p} />
          </div>
          <h3 className={s.cardTitle} style={{ marginTop: 'var(--space-2)' }}>
            <Link href={`/editais/${p.id}`} className="clamp3">
              {readable(p.object)}
            </Link>
          </h3>
          <div className="rg-edital-meta">
            <span>{p.organ.name}</span>
            {place ? <span>{place}</span> : null}
            <span>{p.modality.name}</span>
          </div>
        </div>
        <span className="rg-src rg-src-pncp">PNCP</span>
      </div>

      <Figures p={p} score={r.score} />

      <Criteria criteria={r.criteria} unknownText="Não consta" />
      <Bullets title="Por que serve" items={r.reasons} />
      <Bullets title="Pontos de atenção" items={r.concerns} concern />

      {r.evidence.length > 0 ? (
        <div className={s.block}>
          <h4 className={s.blockTitle}>Trechos do edital</h4>
          {r.evidence.map((e) => (
            <blockquote className={s.quote} data-verified={e.verified} key={e.quote}>
              <p>“{e.quote}”</p>
              <span
                className={`rg-tag ${e.verified ? 'rg-tag-success' : 'rg-tag-warning'}`}
                style={{ alignSelf: 'flex-start' }}
                title={
                  e.verified
                    ? 'Este trecho existe no texto do edital'
                    : 'Não encontramos este trecho no texto do edital. Confira no PNCP'
                }
              >
                {e.verified ? 'Conferido no edital' : 'Não conferido'}
              </span>
            </blockquote>
          ))}
        </div>
      ) : null}

      {sources.length > 0 ? (
        <p className={s.snippet}>
          Fontes na web:
          {sources.map((w) => (
            <span key={w.href}>
              {' '}
              <a href={w.href} target="_blank" rel="noopener noreferrer">
                {w.title || w.host}
              </a>
              <sup className="rg-cite">{cite(w.href)}</sup>
            </span>
          ))}
          . Podem não ser o edital oficial.
        </p>
      ) : null}

      <div className={`rg-edital-actions ${s.actionsWrap}`}>
        <SaveToPipeline procurementId={p.id} />
        <Link className="rg-btn" href={`/editais/${p.id}#ia`}>
          Analisar com IA
        </Link>
        <ReadPdfButton procurementId={p.id} documents={null} />
        {p.source_url ? (
          <a className="rg-btn" href={p.source_url} target="_blank" rel="noopener noreferrer">
            Abrir no PNCP
          </a>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Resultado achado na web, fora da nossa base. Mesma estrutura do cartão da base, mas sempre "não verificado" e sem
 * ação de funil (não há edital nosso por trás).
 */
function WebCard({ o, href }: { o: WebItem; href: string }) {
  const band = fitOf(o.score);
  return (
    <li className={`rg-card rg-edital ${s.card}`}>
      <div className="rg-edital-head">
        <div>
          <div className={s.tags}>
            <span className={`rg-tag ${FIT_TAG[band]}`}>{FIT_LABEL[band]}</span>
            <span className="rg-tag rg-tag-accent">{VERDICT[o.verdict]}</span>
            <span
              className="rg-tag rg-tag-warning"
              title="Este resultado não está na base da Régua e não foi conferido"
            >
              Não verificado
            </span>
          </div>
          <h3 className={s.cardTitle} style={{ marginTop: 'var(--space-2)' }}>
            <a href={href} target="_blank" rel="noopener noreferrer">
              {o.title || o.host}
            </a>
          </h3>
          <p className={s.host}>{o.host}</p>
        </div>
        <span className="rg-src rg-src-web">Web</span>
      </div>
      {o.snippet ? <p className={s.snippet}>{o.snippet}</p> : null}
      <div className="rg-edital-figs">
        <div>
          <div className="rg-fig-label">Compatibilidade</div>
          <div
            className="rg-match"
            title="Nota só pelo título e pelo trecho achados, calculada no servidor"
          >
            {o.score}%
          </div>
        </div>
      </div>
      <Criteria criteria={o.criteria} unknownText="Não consta no trecho" />
      <Bullets title="O que o trecho mostra" items={o.reasons} />
      <Bullets title="Pontos de atenção" items={o.concerns} concern />
      <div className="rg-edital-actions">
        <a className="rg-btn rg-btn-primary" href={href} target="_blank" rel="noopener noreferrer">
          Abrir no portal
        </a>
      </div>
    </li>
  );
}

/** Acompanhamento fixo (ex.: assessoria jurídica em LGPD): aparece sempre que houver edital, mesmo fora do pedido. */
function Watch({ label, items }: { label: string; items: Proc[] }) {
  if (items.length === 0) return null;
  return (
    <section className={s.watch} aria-label={`${label}: abertos agora`}>
      <h3 className={s.section}>{label}: abertos agora</h3>
      <p className={s.sectionNote}>
        Acompanhamento fixo: aparece sempre que houver, mesmo fora do seu pedido.
      </p>
      <ul className={s.list}>
        {items.map((p) => {
          const place = [p.organ.municipality, p.organ.uf].filter(Boolean).join(' ');
          return (
            <li className={`rg-card rg-edital ${s.card}`} key={p.id}>
              <div className="rg-edital-head">
                <div>
                  <h4 className={s.cardTitle}>
                    <Link href={`/editais/${p.id}`} className="clamp3">
                      {readable(p.object)}
                    </Link>
                  </h4>
                  <div className="rg-edital-meta">
                    <span>{p.organ.name}</span>
                    {place ? <span>{place}</span> : null}
                    <span>{p.modality.name}</span>
                  </div>
                </div>
                <span className="rg-src rg-src-pncp">PNCP</span>
              </div>
              <Figures p={p} />
              <div className={`rg-edital-actions ${s.actionsWrap}`}>
                <SaveToPipeline procurementId={p.id} />
                <Link className="rg-btn" href={`/editais/${p.id}`}>
                  Abrir edital
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Resposta do chat. Tudo aqui é desenho do que o servidor devolveu: a nota é calculada lá, a conferência dos
 * trechos também (`verified`) e os links da web vêm do buscador, nunca da IA. Os filtros abaixo só escondem
 * linhas no navegador, sem nova chamada, e nada é descartado por nota: tudo que veio pode ser visto.
 */
export function ChatAnswer({
  data,
  pncp,
  web: webOn,
  onChangePrompt,
}: {
  data: AiSearchResponse;
  pncp: boolean;
  web: boolean;
  onChangePrompt: () => void;
}) {
  const { understood, results, meta } = data;
  const headRef = useRef<HTMLHeadingElement>(null);
  const web = useMemo(
    () =>
      (data.web_opportunities ?? [])
        .map((o) => ({ o, href: safeHttp(o.url) }))
        .filter((x): x is { o: WebItem; href: string } => x.href !== null),
    [data.web_opportunities],
  );

  const [situation, setSituation] = useState<Situation>('all');
  const [fit, setFit] = useState<Fit>('all');
  const [uf, setUf] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);

  // Resposta nova: leva o foco ao título (leitor de tela e teclado) e mostra o começo dela.
  useEffect(() => {
    headRef.current?.focus();
    headRef.current?.scrollIntoView({ block: 'start' });
  }, []);

  const ufs = useMemo(() => {
    const all = new Set<string>();
    for (const r of results) if (r.procurement.organ.uf) all.add(r.procurement.organ.uf);
    for (const w of data.watchlist ?? [])
      for (const p of w.items) if (p.organ.uf) all.add(p.organ.uf);
    return [...all].sort();
  }, [results, data.watchlist]);

  // Citações numeradas: cada fonte da web ganha um número, na ordem em que aparece nos cartões.
  const citations = useMemo(() => {
    const order: { href: string; title: string; host: string }[] = [];
    const index = new Map<string, number>();
    for (const r of results)
      for (const w of r.web_sources.slice(0, MAX_WEB_SOURCES)) {
        const href = safeHttp(w.url);
        if (href && !index.has(href)) {
          index.set(href, order.length + 1);
          order.push({ href, title: w.title, host: w.host });
        }
      }
    return { order, index };
  }, [results]);

  const baseFiltered = results.filter(
    (r) =>
      matchSituation(r.procurement, situation) &&
      matchFit(r.score, fit) &&
      (!uf || r.procurement.organ.uf === uf),
  );
  // Resultado da web não tem situação nem estado confiáveis: com esses filtros ligados ele sai da lista (e a tela diz).
  const webHidden = situation !== 'all' || uf !== '';
  const webFiltered = webHidden ? [] : web.filter((x) => matchFit(x.o.score, fit));
  const total = results.length + web.length;
  const count = baseFiltered.length + webFiltered.length;
  const filtersOn = situation !== 'all' || fit !== 'all' || uf !== '';
  const visible = baseFiltered.slice(0, shown);
  const hiddenMore = baseFiltered.length - visible.length;

  const degraded = meta.degraded.map((d) => DEGRADED_TEXT[d] ?? `Recurso indisponível: ${d}.`);
  const webOff = webOn && meta.web_search !== 'ok';

  const active: string[] = [];
  if (situation !== 'all')
    active.push(`Situação: ${situation === 'open' ? 'Em vigor' : 'Em andamento / encerrados'}`);
  if (fit !== 'all') active.push(`Atende: ${FIT_LABEL[fit]}`);
  if (uf) active.push(`Estado: ${ufName(uf)}`);

  function clear() {
    setSituation('all');
    setFit('all');
    setUf('');
    setShown(PAGE_SIZE);
  }

  const watchFiltered = (data.watchlist ?? [])
    .map((w) => ({
      ...w,
      items: w.items.filter((p) => matchSituation(p, situation) && (!uf || p.organ.uf === uf)),
    }))
    .filter((w) => w.items.length > 0);

  return (
    <div className={`rg-msg-ai ${s.answer}`}>
      <h2 className={s.answerHead} ref={headRef} tabIndex={-1}>
        {pncp ? <span className="rg-src rg-src-pncp">PNCP</span> : null}
        {webOn ? <span className="rg-src rg-src-web">Web</span> : null}
        <span>
          {total === 0
            ? 'Nada combinou com esse pedido'
            : `${results.length} ${results.length === 1 ? 'edital avaliado' : 'editais avaliados'}${
                web.length > 0
                  ? ` e ${web.length} ${web.length === 1 ? 'resultado' : 'resultados'} da web`
                  : ''
              }`}
        </span>
        <span className="rg-src rg-src-model" title="Avaliação gerada por IA">
          IA
        </span>
      </h2>

      {degraded.map((t) => (
        <div className="rg-banner rg-banner-warning" key={t}>
          <div className="rg-banner-body">
            <p>{t}</p>
          </div>
        </div>
      ))}
      {webOff && results.length > 0 ? (
        <div className="rg-banner rg-banner-warning">
          <div className="rg-banner-body">
            <p>Conferência na web indisponível; a avaliação usou só o texto do edital.</p>
          </div>
        </div>
      ) : null}

      {data.conclusion ? <p className={s.conclusion}>{data.conclusion}</p> : null}

      <div className="rg-filters">
        <span>Filtros aplicados:</span>
        {understood.filters.length === 0 ? <span>nenhum</span> : null}
        {understood.filters.map((f) => (
          <span className="rg-filter" key={f}>
            {f}
          </span>
        ))}
      </div>
      <p className={s.kw}>
        Entendi assim: {understood.summary}
        {understood.keywords.length > 0 ? ` Palavras: ${understood.keywords.join(', ')}.` : ''}
      </p>

      {total > 0 ? (
        <fieldset className={s.filterBar} aria-label="Filtrar os resultados">
          <label className={s.field}>
            Situação
            <select
              value={situation}
              onChange={(e) => {
                setSituation(e.target.value as Situation);
                setShown(PAGE_SIZE);
              }}
            >
              <option value="all">Todos</option>
              <option value="open">Em vigor (propostas abertas)</option>
              <option value="ongoing">Em andamento / encerrados</option>
            </select>
          </label>
          <label className={s.field}>
            Atende
            <select
              value={fit}
              onChange={(e) => {
                setFit(e.target.value as Fit);
                setShown(PAGE_SIZE);
              }}
            >
              <option value="all">Todos</option>
              <option value="meets">Só os que atendem</option>
              <option value="partial">Atendem em parte</option>
              <option value="missing">Não atendem</option>
            </select>
          </label>
          <label className={s.field}>
            Estado
            <select
              value={uf}
              onChange={(e) => {
                setUf(e.target.value);
                setShown(PAGE_SIZE);
              }}
            >
              <option value="">Todos</option>
              {ufs.map((u) => (
                <option key={u} value={u}>
                  {ufName(u)}
                </option>
              ))}
            </select>
          </label>
          <p className={s.count} role="status" aria-live="polite">
            {count} de {total} {total === 1 ? 'resultado' : 'resultados'}
          </p>
          {filtersOn ? (
            <button type="button" className={s.link} onClick={clear}>
              Limpar filtros
            </button>
          ) : null}
        </fieldset>
      ) : null}

      {pncp ? (
        <>
          <h3 className={s.section}>
            <span className="rg-src rg-src-pncp">PNCP</span> Na base da Régua
          </h3>
          {results.length === 0 ? (
            <div className="rg-empty">
              <div className="rg-empty-head">
                <span>Base da Régua</span>
                <span className="rg-num">0</span>
              </div>
              <div className="rg-empty-body">
                <p className="rg-empty-title">
                  {data.candidates_considered > 0
                    ? `A IA avaliou ${data.candidates_considered} ${data.candidates_considered === 1 ? 'edital' : 'editais'} e nenhum veio na lista.`
                    : 'Nenhum edital da nossa base combina com esse pedido.'}
                </p>
                <p>
                  Tente ampliar: tire a região ou a faixa de valor, ou descreva o objeto com outras
                  palavras. A base ainda é parcial, então um edital que existe no PNCP pode não
                  estar aqui.
                </p>
                <button type="button" className="rg-btn" onClick={onChangePrompt}>
                  Mudar o pedido
                </button>
              </div>
            </div>
          ) : baseFiltered.length === 0 ? (
            <div className="rg-empty">
              <div className="rg-empty-head">
                <span>Base da Régua</span>
                <span className="rg-num">0 de {results.length}</span>
              </div>
              <div className="rg-empty-body">
                <p className="rg-empty-title">Nenhum edital da base com esses filtros.</p>
                <p>
                  Tire {active.length > 1 ? 'algum destes filtros' : 'este filtro'}:{' '}
                  {active.join('; ')}. Os resultados continuam aqui, só estão escondidos.
                </p>
                <button type="button" className="rg-btn" onClick={clear}>
                  Limpar filtros
                </button>
              </div>
            </div>
          ) : (
            <>
              <ol className={s.list}>
                {visible.map((r) => (
                  <RankedCard
                    key={r.procurement.id}
                    r={r}
                    cite={(url) => citations.index.get(url)}
                  />
                ))}
              </ol>
              {hiddenMore > 0 ? (
                <div className={s.moreRow}>
                  <button
                    type="button"
                    className="rg-btn"
                    onClick={() => setShown(baseFiltered.length)}
                  >
                    Ver mais ({hiddenMore})
                  </button>
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}

      {webOn && web.length > 0 ? (
        <>
          <h3 className={s.section}>
            <span className="rg-src rg-src-web">Web</span> Encontrados na web
          </h3>
          <p className={s.sectionNote}>
            Fora da nossa base e não verificados: a nota usa só o título e o trecho achados. Confira
            no portal.
          </p>
          {webHidden ? (
            <p className={s.sectionNote}>
              Escondidos pelos filtros de situação e estado (resultados da web não trazem esses
              dados). Limpe esses filtros para vê-los.
            </p>
          ) : webFiltered.length === 0 ? (
            <p className={s.sectionNote}>
              Nenhum resultado da web com o filtro "Atende" escolhido.
            </p>
          ) : (
            <ol className={s.list}>
              {webFiltered.map((x) => (
                <WebCard key={x.href} o={x.o} href={x.href} />
              ))}
            </ol>
          )}
        </>
      ) : webOn && !webOff && results.length === 0 ? (
        <p className={s.sectionNote}>A busca na web não trouxe resultados para esse pedido.</p>
      ) : null}

      {watchFiltered.map((w) => (
        <Watch key={w.key} label={w.label} items={w.items} />
      ))}

      {citations.order.length > 0 ? (
        <ol className="rg-sources" aria-label="Fontes citadas">
          {citations.order.map((c, i) => (
            <li key={c.href}>
              <span className="rg-n">{i + 1}</span>
              <a href={c.href} target="_blank" rel="noopener noreferrer">
                {c.title || c.host}
              </a>
              <span className="rg-dom">{c.host}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className={s.foot}>
        <p>
          Avaliação gerada por IA (modelo {meta.model}). Confira no edital antes de decidir.
          {data.disclaimer ? ` ${data.disclaimer}` : ''}
        </p>
        <details>
          <summary>Detalhes técnicos</summary>
          <dl className={s.tech}>
            <dt>Provedor e modelo</dt>
            <dd>
              {meta.provider} · {meta.model}
            </dd>
            <dt>Editais avaliados</dt>
            <dd>
              {data.candidates_considered} de {data.total_matches} que combinaram com a busca
            </dd>
            <dt>Tokens</dt>
            <dd>
              {meta.tokens_in ?? '–'} de entrada · {meta.tokens_out ?? '–'} de saída
            </dd>
            <dt>Tempo</dt>
            <dd>{(meta.took_ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s</dd>
            <dt>Conferência na web</dt>
            <dd>
              {!webOn
                ? 'desligada neste pedido'
                : meta.web_search === 'ok'
                  ? 'feita'
                  : meta.web_search === 'failed'
                    ? 'falhou'
                    : 'não configurada'}
            </dd>
          </dl>
        </details>
      </div>
    </div>
  );
}
