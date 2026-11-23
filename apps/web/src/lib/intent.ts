import type { SearchIntentInput } from '@agora/contracts';
import { DEADLINES, type DeadlineFilter, SORTS, type Sort } from './filters';

type Params = Record<string, string | string[] | undefined>;

const all = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const num = (v: string) => {
  const n = v === '' ? Number.NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

export const PAGE_SIZES = [20, 50] as const;

/** Filtros lidos da URL. A URL é a fonte da verdade (voltar, compartilhar e histórico funcionam). */
export interface UrlFilters {
  q: string;
  uf: string[];
  modality: string[];
  orgs: string[];
  /** Códigos IBGE dos municípios escolhidos (CE e PI). */
  municipality: string[];
  valueMin: number | null;
  valueMax: number | null;
  deadline: DeadlineFilter;
  from: string;
  to: string;
  onlyOpen: boolean;
  sort: Sort;
  page: number;
  perPage: number;
}

export function readFilters(sp: Params): UrlFilters {
  const rawDeadline = one(sp.prazo) as DeadlineFilter;
  const rawSort = one(sp.ordem) as Sort;
  const rawPage = Number(one(sp.pagina));
  const rawSize = Number(one(sp.por_pagina));
  return {
    q: one(sp.q),
    uf: all(sp.uf),
    modality: all(sp.modalidade),
    orgs: all(sp.orgao),
    municipality: all(sp.municipio).filter((c) => /^d{7}$/.test(c)),
    valueMin: num(one(sp.valor_min)),
    valueMax: num(one(sp.valor_max)),
    deadline: DEADLINES.includes(rawDeadline) ? rawDeadline : '',
    from: one(sp.de),
    to: one(sp.ate),
    onlyOpen: one(sp.abertas) !== '0',
    sort: SORTS.some((s) => s.value === rawSort) ? rawSort : 'relevance',
    page: Number.isInteger(rawPage) && rawPage >= 1 ? Math.min(rawPage, 100) : 1,
    perPage: PAGE_SIZES.find((s) => s === rawSize) ?? PAGE_SIZES[0],
  };
}

const BRT = '-03:00';
const dayStart = (ymd: string) => new Date(`${ymd}T00:00:00${BRT}`);
const brtDay = (d: Date) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(d);

/**
 * Converte os filtros da URL em SearchIntent (docs/06 §2). Janelas relativas de prazo ("hoje", "7 dias") usam o
 * relógio do servidor web (Node), no dia civil de Brasília; quem aplica o filtro e calcula o prazo exibido é a API.
 */
export function toIntent(f: UrlFilters, now: Date = new Date()): SearchIntentInput {
  let deadline: { from?: string; to?: string } | undefined;
  if (f.deadline === 'hoje') {
    const start = dayStart(brtDay(now));
    deadline = {
      from: now.toISOString(),
      to: new Date(start.getTime() + 86_400_000 - 1000).toISOString(),
    };
  } else if (f.deadline === '7d' || f.deadline === '30d') {
    const days = f.deadline === '7d' ? 7 : 30;
    deadline = {
      from: now.toISOString(),
      to: new Date(now.getTime() + days * 86_400_000).toISOString(),
    };
  } else if (f.deadline === 'data') {
    deadline = {
      ...(f.from ? { from: dayStart(f.from).toISOString() } : {}),
      ...(f.to ? { to: new Date(dayStart(f.to).getTime() + 86_400_000 - 1000).toISOString() } : {}),
    };
  }
  const modality = f.modality.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 13);
  return {
    ...(f.q.trim() ? { q: f.q.trim().slice(0, 500) } : {}),
    filters: {
      ...(f.uf.length ? { uf: f.uf as never } : {}),
      ...(modality.length ? { modality } : {}),
      ...(f.orgs.length ? { organ_cnpj: f.orgs } : {}),
      ...(f.municipality.length ? { municipality_ibge: f.municipality } : {}),
      ...(f.valueMin !== null || f.valueMax !== null
        ? {
            value: {
              ...(f.valueMin !== null ? { min: f.valueMin } : {}),
              ...(f.valueMax !== null ? { max: f.valueMax } : {}),
            },
          }
        : {}),
      ...(deadline && Object.keys(deadline).length ? { proposals_deadline: deadline } : {}),
      ...(f.onlyOpen ? { status: ['open_for_proposals' as const] } : {}),
    },
    sort: f.sort,
    page: f.page,
    limit: f.perPage,
    facets: ['uf', 'modality'],
  };
}
