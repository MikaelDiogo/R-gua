'use client';

import type { SearchResponse } from '@agora/contracts';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { COVERAGE_LABEL } from '@/lib/coverage';
import { type DeadlineFilter, SORTS, type Sort } from '@/lib/filters';
import { fmtTime } from '@/lib/format';
import { useSearchHistory } from '@/lib/history';
import { PAGE_SIZES, readFilters } from '@/lib/intent';
import { modalityLabel } from '@/lib/modalities';
import { monitorHrefFromSearch } from '@/lib/monitors';
import { FacetList } from './FacetList';
import { Icon } from './Icon';
import { Pagination, RangeText } from './Pagination';
import { ResultTable } from './ResultCard';
import { SearchBox } from './SearchBox';
import {
  DeadlineFilterControl,
  deadlineSummary,
  OrganFilter,
  useOrganNames,
  ValueFilter,
  valueSummary,
} from './SearchFilters';
import s from './search.module.css';
import { PageHeader } from './ui';

/** Parâmetros que não fazem parte da "busca" em si (não vão para o histórico). */
const NON_SEARCH = ['q', 'pagina', 'por_pagina', 'ordem', 'modo'];

const DEGRADED_LABEL: Record<string, string> = {
  semantic: 'a busca por sentido',
  rerank: 'a reordenação dos resultados',
  nl_understanding: 'a interpretação de frases',
  lexical_bm25: 'a busca avançada por palavras (usando a básica)',
};

const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

export interface ViewError {
  title: string;
  detail: string;
}

/**
 * Busca: a página (servidor) chama POST /v1/search com o que está na URL e entrega o resultado pronto.
 * Aqui só se desenha, e cada mudança de filtro grava na URL, o que pede nova leitura ao servidor.
 */
export function SearchView({
  data,
  error,
}: {
  data: SearchResponse | null;
  error: ViewError | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const history = useSearchHistory();
  const [pending, startTransition] = useTransition();

  const filters = readFilters(
    Object.fromEntries([...new Set(sp.keys())].map((k) => [k, sp.getAll(k)])),
  );
  const {
    q: urlQ,
    uf,
    modality,
    orgs,
    valueMin,
    valueMax,
    deadline,
    from,
    to,
    onlyOpen,
    sort,
  } = filters;
  const orgNames = useOrganNames(orgs);

  const [text, setText] = useState(urlQ);
  const [railOpen, setRailOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => setText(urlQ), [urlQ]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** Grava na URL. Mudar qualquer filtro volta para a página 1. */
  const update = (patch: Record<string, string | string[] | null>, keepPage = false) => {
    const next = new URLSearchParams(sp.toString());
    if (!keepPage) next.delete('pagina');
    for (const [k, v] of Object.entries(patch)) {
      next.delete(k);
      if (Array.isArray(v)) for (const x of v) next.append(k, x);
      else if (v !== null && v !== '') next.set(k, v);
    }
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  /** Os filtros da busca atual como texto, para o histórico. */
  const filtersQs = () => {
    const next = new URLSearchParams(sp.toString());
    for (const k of NON_SEARCH) next.delete(k);
    return next.toString();
  };

  const onType = (v: string) => {
    setText(v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => update({ q: v.trim() || null }), 400);
  };
  const submit = (v: string) => {
    window.clearTimeout(timer.current);
    update({ q: v.trim() || null });
    history.add(v, filtersQs());
  };
  const rerun = (h: { q: string; qs: string }) => {
    const next = new URLSearchParams(h.qs);
    if (h.q) next.set('q', h.q);
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  // Atalho "/" foca a busca (docs/01 RNF-UX-05).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(el.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items = data?.items ?? [];
  const meta = data?.meta ?? null;
  const total = meta?.total_estimate ?? 0;
  const approx = meta ? !meta.total_exact : false;
  const pageSize = data?.page_size ?? filters.perPage;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(data?.page ?? filters.page, pages);
  const from1 = items.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const to1 = items.length === 0 ? 0 : (page - 1) * pageSize + items.length;
  const legsOk = meta ? meta.legs.lexical === 'ok' : false;
  const degraded = meta?.degraded ?? [];

  const goPage = (n: number) => {
    update({ pagina: n <= 1 ? null : String(n) }, true);
    const h = document.getElementById('results-h');
    h?.focus();
    h?.scrollIntoView({ block: 'start' });
  };
  const setPerPage = (n: number) =>
    update({ por_pagina: n === PAGE_SIZES[0] ? null : String(n), pagina: null }, true);

  const advanced = uf.length + modality.length + (onlyOpen ? 0 : 1);
  const hasFilters =
    advanced +
      orgs.length +
      (valueMin !== null || valueMax !== null ? 1 : 0) +
      (deadline ? 1 : 0) +
      (urlQ.trim() ? 1 : 0) >
    0;
  const clearAll = () => {
    setText('');
    startTransition(() => router.replace(pathname, { scroll: false }));
  };

  const chips: { key: string; label: string; remove: () => void }[] = [
    ...(onlyOpen
      ? []
      : [{ key: 'open', label: 'Inclui encerrados', remove: () => update({ abertas: null }) }]),
    ...uf.map((v) => ({
      key: `uf-${v}`,
      label: `UF: ${v}`,
      remove: () => update({ uf: toggle(uf, v) }),
    })),
    ...modality.map((v) => ({
      key: `m-${v}`,
      label: modalityLabel(v),
      remove: () => update({ modalidade: toggle(modality, v) }),
    })),
  ];

  const lead = error
    ? 'Buscando nos editais do PNCP.'
    : items.length
      ? `${approx ? 'Cerca de ' : ''}${total.toLocaleString('pt-BR')} ${total === 1 ? 'edital combina' : 'editais combinam'} com a sua busca.`
      : legsOk
        ? 'Nenhum edital combina com a sua busca.'
        : 'A busca não respondeu por completo.';

  const activeCount =
    orgs.length + (valueMin !== null || valueMax !== null ? 1 : 0) + (deadline ? 1 : 0) + advanced;

  return (
    <>
      <PageHeader
        title="Buscador de licitações"
        lead={lead}
        actions={
          <div className={s.headLinks}>
            {hasFilters ? (
              <Link className="rg-btn" href={monitorHrefFromSearch(sp)}>
                <Icon name="bell" size={14} /> Criar monitor com esta busca
              </Link>
            ) : null}
            <Link className="rg-btn rg-btn-quiet" href="/chat">
              <Icon name="sparkle" size={14} /> Perguntar à IA
            </Link>
          </div>
        }
      />
      <p className={s.coverage}>Cobertura: {COVERAGE_LABEL}</p>

      <search className={s.searchTop} data-aura="">
        <SearchBox
          value={text}
          onChange={onType}
          onSubmit={submit}
          history={history.list}
          onPickHistory={rerun}
          onToggleFav={history.toggleFav}
          onRemove={history.remove}
          onClearHistory={history.clear}
          inputRef={inputRef}
        />
      </search>

      <div className={s.layout}>
        <aside className={s.rail} data-open={railOpen || undefined} aria-label="Filtros">
          <button
            type="button"
            className={`rg-btn ${s.railToggle}`}
            aria-expanded={railOpen}
            aria-controls="rail-body"
            onClick={() => setRailOpen((v) => !v)}
          >
            Filtros{activeCount ? ` (${activeCount})` : ''}
            <Icon name="chevronDown" size={14} />
          </button>
          <div className={s.railHead}>
            <h2 className={s.railTitle}>Filtros</h2>
            {hasFilters ? (
              <button type="button" className={s.linkBtn} onClick={clearAll}>
                Limpar filtros
              </button>
            ) : null}
          </div>
          <div className={s.railBody} id="rail-body">
            <OrganFilter selected={orgs} names={orgNames} onChange={(c) => update({ orgao: c })} />
            <ValueFilter
              min={valueMin}
              max={valueMax}
              onChange={(a, b) =>
                update({
                  valor_min: a === null ? null : String(a),
                  valor_max: b === null ? null : String(b),
                })
              }
            />
            <DeadlineFilterControl
              value={deadline}
              from={from}
              to={to}
              onChange={(d, f, t) => update({ prazo: d || null, de: f || null, ate: t || null })}
            />
            <FacetList
              title="UF"
              options={data?.facets.uf ?? []}
              selected={uf}
              onToggle={(v) => update({ uf: toggle(uf, v) })}
            />
            <FacetList
              title="Modalidade"
              options={(data?.facets.modality ?? []).map((o) => ({
                ...o,
                label: o.label || modalityLabel(o.value),
              }))}
              selected={modality}
              onToggle={(v) => update({ modalidade: toggle(modality, v) })}
            />
            <fieldset className={s.facet}>
              <legend>Situação</legend>
              <label className={s.onlyOpen}>
                <input
                  type="checkbox"
                  checked={onlyOpen}
                  onChange={() => update({ abertas: onlyOpen ? '0' : null })}
                />
                <span>Só propostas abertas</span>
              </label>
            </fieldset>
          </div>
        </aside>

        <section className={s.results} aria-labelledby="results-h" aria-busy={pending}>
          <div className={s.resultsHead}>
            <h2 id="results-h" className={s.srOnly} tabIndex={-1}>
              Resultados
            </h2>
            <p className={s.meta} aria-live="polite">
              {pending ? (
                'Buscando…'
              ) : meta ? (
                <>
                  <RangeText
                    from={from1}
                    to={to1}
                    total={total}
                    approx={approx && total > 0}
                    noun={total === 1 ? 'resultado' : 'resultados'}
                  />
                  {' · '}índice atualizado às {fmtTime(meta.index_freshness_at)}
                </>
              ) : null}
            </p>
            <div className={s.sortSelect}>
              <label htmlFor="sort">Ordenar por</label>
              <select
                id="sort"
                value={sort}
                onChange={(e) =>
                  update({
                    ordem: e.target.value === 'relevance' ? null : (e.target.value as Sort),
                  })
                }
              >
                {SORTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className={s.chipRow}>
            <legend className={s.srOnly}>Filtros ativos</legend>
            {orgs.map((c) => {
              const name = orgNames[c] ?? c;
              return (
                <span className={s.chip} key={`o-${c}`}>
                  {name}
                  <button
                    type="button"
                    onClick={() => update({ orgao: toggle(orgs, c) })}
                    aria-label={`Remover órgão ${name}`}
                  >
                    <Icon name="x" size={12} />
                  </button>
                </span>
              );
            })}
            {valueMin !== null || valueMax !== null ? (
              <span className={s.chip}>
                Valor: {valueSummary(valueMin, valueMax)}
                <button
                  type="button"
                  onClick={() => update({ valor_min: null, valor_max: null })}
                  aria-label="Remover filtro de valor"
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            ) : null}
            {deadline ? (
              <span className={s.chip}>
                Prazo: {deadlineSummary(deadline as DeadlineFilter, from, to)}
                <button
                  type="button"
                  onClick={() => update({ prazo: null, de: null, ate: null })}
                  aria-label="Remover filtro de prazo"
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            ) : null}
            {chips.map((c) => (
              <span className={s.chip} key={c.key}>
                {c.label}
                <button type="button" onClick={c.remove} aria-label={`Remover filtro ${c.label}`}>
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
          </fieldset>

          {degraded.length > 0 ? (
            <div className="rg-banner rg-banner-warning" role="status">
              <div className="rg-banner-body">
                <p className="rg-banner-title">Busca com recursos indisponíveis</p>
                <p>
                  Está indisponível agora: {degraded.map((d) => DEGRADED_LABEL[d] ?? d).join(', ')}.
                  Os resultados abaixo podem estar incompletos.
                </p>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rg-banner rg-banner-error" role="alert">
              <div className="rg-banner-body">
                <p className="rg-banner-title">{error.title}</p>
                <p>{error.detail}</p>
              </div>
              <button
                type="button"
                className="rg-btn"
                onClick={() => startTransition(() => router.refresh())}
              >
                <Icon name="refresh" size={14} /> Tentar de novo
              </button>
            </div>
          ) : items.length === 0 ? (
            legsOk ? (
              <div className="rg-empty">
                <div className="rg-empty-head">
                  <span>Resultados</span>
                  <span className={s.num}>0</span>
                </div>
                <div className="rg-empty-body">
                  <p className="rg-empty-title">Nenhum edital encontrado.</p>
                  <p>
                    Tente menos filtros ou outras palavras. A busca respondeu normalmente: não há
                    editais coletados com esses critérios.
                  </p>
                  <button type="button" className="rg-btn" onClick={clearAll}>
                    Limpar filtros
                  </button>
                </div>
              </div>
            ) : (
              <div className="rg-banner rg-banner-warning" role="status">
                <div className="rg-banner-body">
                  <p className="rg-banner-title">A busca não respondeu por completo.</p>
                  <p>
                    Uma parte da busca falhou, então a lista vazia não quer dizer que não existam
                    editais. Tente de novo em instantes.
                  </p>
                </div>
                <button
                  type="button"
                  className="rg-btn"
                  onClick={() => startTransition(() => router.refresh())}
                >
                  Tentar de novo
                </button>
              </div>
            )
          ) : (
            <ResultTable items={items} pending={pending} />
          )}

          {items.length > 0 ? (
            <Pagination
              id="busca"
              page={page}
              pages={pages}
              perPage={pageSize}
              onPage={goPage}
              onPerPage={setPerPage}
              label="Paginação dos resultados"
            />
          ) : null}
        </section>
      </div>
    </>
  );
}
