import {
  ALLOWED_UFS,
  type MunicipalitiesResponse,
  type OrganSuggestResponse,
  type ProcurementDetail,
  type SearchIntent,
  type SearchResponse,
  type SuggestResponse,
} from '@agora/contracts';
import { type Db } from '@agora/db';
import { extractPlace, MUNICIPALITIES, searchMunicipalities } from '@agora/domain';
import { Injectable } from '@nestjs/common';
import { CLOCK, type Clock, DB, InjectClock, InjectDb } from '../platform/db.module';
import { DomainError } from '../platform/problem.filter';
import {
  DETAIL_COLUMNS,
  type DetailRow,
  SUMMARY_COLUMNS,
  type SummaryRow,
  toDetail,
  toSummary,
} from '../platform/serialize';
import { fold } from './highlight';

/** Cobertura do produto: todos os estados. Aplicada em TODA consulta (UF desconhecida fica de fora), ignorando o que o cliente pedir. */
const COVERED = [...ALLOWED_UFS];

type Omit_ = 'uf' | 'modality' | undefined;
void DB;
void CLOCK;

/** Sinônimos do domínio (docs/06 §3). Só para sugestão: a busca em si usa o FTS em português. */
const SYNONYMS: Record<string, string[]> = {
  ti: ['tecnologia da informação', 'informática'],
  rp: ['registro de preços'],
  srp: ['sistema de registro de preços'],
  pe: ['pregão eletrônico'],
  epi: ['equipamento de proteção individual'],
  notebook: ['computador portátil', 'microcomputador'],
};

@Injectable()
export class SearchService {
  private freshness: { at: Date | null; read: number } = { at: null, read: 0 };

  constructor(
    @InjectDb() private readonly db: Db,
    @InjectClock() private readonly clock: Clock,
  ) {}

  /** WHERE dos filtros duros, idêntico para lista, total e facetas (docs/06 §1). `omit` tira o próprio filtro da faceta. */
  private where(intent: SearchIntent, params: unknown[], omit?: Omit_): string {
    const f = intent.filters;
    const w: string[] = [];
    const add = (sql: string, ...vals: unknown[]) => {
      let s = sql;
      for (const v of vals) {
        params.push(v);
        s = s.replace('?', `$${params.length}`);
      }
      w.push(s);
    };

    // O texto da busca precisa ser sempre o parâmetro $1 (a ordenação por relevância depende disso): ele vem antes de qualquer outro.
    if (intent.q?.trim()) {
      add("s.tsv @@ websearch_to_tsquery('portuguese', immutable_unaccent(?))", intent.q.trim());
    }
    add('p.uf = ANY(?)', COVERED);
    if (f.uf?.length && omit !== 'uf') add('p.uf = ANY(?)', f.uf);
    if (f.modality?.length && omit !== 'modality') add('p.modality = ANY(?)', f.modality);
    if (f.municipality_ibge?.length) add('p.municipality_ibge = ANY(?)', f.municipality_ibge);
    if (f.organ_cnpj?.length) add('p.organ_cnpj = ANY(?)', f.organ_cnpj);
    if (f.sphere?.length) add('o.sphere = ANY(?)', f.sphere);
    if (f.value?.min !== undefined) add('p.estimated_value >= ?', f.value.min);
    if (f.value?.max !== undefined) add('p.estimated_value <= ?', f.value.max);
    if (f.proposals_deadline?.from) add('p.proposals_close_at >= ?', f.proposals_deadline.from);
    if (f.proposals_deadline?.to) add('p.proposals_close_at <= ?', f.proposals_deadline.to);
    if (f.published?.from) add('p.published_at >= ?', f.published.from);
    if (f.published?.to) add('p.published_at <= ?', f.published.to);
    if (f.status?.length) {
      const parts: string[] = [];
      if (f.status.includes('open_for_proposals')) {
        // Reaplica o prazo: o job que fecha vencidos pode atrasar e nunca mostra edital fechado como aberto (docs/07 §3).
        parts.push("(p.status = 'open_for_proposals' AND p.proposals_close_at > now())");
      }
      if (f.status.includes('closed')) {
        parts.push(
          "(p.status = 'closed' OR (p.status = 'open_for_proposals' AND p.proposals_close_at <= now()))",
        );
      }
      const rest = f.status.filter((s) => s !== 'open_for_proposals' && s !== 'closed');
      if (rest.length) {
        params.push(rest);
        parts.push(`p.status = ANY($${params.length})`);
      }
      w.push(`(${parts.join(' OR ')})`);
    }
    return w.length ? `WHERE ${w.join(' AND ')}` : '';
  }

  private fromClause(intent: SearchIntent): string {
    const join = intent.q?.trim() ? 'JOIN procurement_search s ON s.procurement_id = p.id' : '';
    return `FROM procurements p JOIN organs o ON o.cnpj = p.organ_cnpj ${join}`;
  }

  private orderBy(intent: SearchIntent, qParam: number | null): string {
    switch (intent.sort) {
      case 'deadline_asc':
        // Em aberto primeiro (as que encerram antes no topo); depois as já encerradas, da mais recente para a mais antiga.
        return `(p.proposals_close_at IS NOT NULL AND p.proposals_close_at > now()) DESC, CASE WHEN p.proposals_close_at > now() THEN p.proposals_close_at END ASC NULLS LAST, p.proposals_close_at DESC NULLS LAST, p.id`;
      case 'published_desc':
        return 'p.published_at DESC NULLS LAST, p.id';
      case 'value_desc':
        return 'p.estimated_value DESC NULLS LAST, p.id';
      default:
        return qParam
          ? `ts_rank_cd(s.tsv, websearch_to_tsquery('portuguese', immutable_unaccent($${qParam})), 2) DESC, p.proposals_close_at ASC NULLS LAST, p.id`
          : 'p.published_at DESC NULLS LAST, p.id';
    }
  }

  /**
   * Lugar do pedido, lido pelo servidor (sem IA): "Licitações em Crateús" vira filtro de município e o texto que
   * sobra (nada, neste caso) é o que a busca exige no objeto. Filtro de município já informado vale como veio.
   */
  private applyPlace(intent: SearchIntent): {
    intent: SearchIntent;
    applied: NonNullable<SearchResponse['meta']['applied']>;
  } {
    const toApplied = (ibges: string[]) =>
      MUNICIPALITIES.filter((m) => ibges.includes(m.ibge)).map((m) => ({
        name: m.name,
        ibge: m.ibge,
        uf: m.uf,
      }));
    const already = intent.filters.municipality_ibge;
    if (already?.length) {
      return {
        intent,
        applied: { municipalities: toApplied(already), text: intent.q?.trim() || null },
      };
    }
    const q = intent.q?.trim();
    if (q) {
      const place = extractPlace(q);
      if (place.municipalities.length > 0) {
        const ibges = place.municipalities.map((m) => m.ibge);
        return {
          intent: {
            ...intent,
            q: place.rest || undefined,
            filters: { ...intent.filters, municipality_ibge: ibges },
          },
          applied: { municipalities: toApplied(ibges), text: place.rest || null },
        };
      }
    }
    return { intent, applied: { municipalities: [], text: q || null } };
  }

  /** Autocomplete de município (só CE e PI). */
  municipalities(qRaw: string | undefined, limit: number): MunicipalitiesResponse {
    return {
      items: searchMunicipalities((qRaw ?? '').trim().slice(0, 80), limit).map((m) => ({
        name: m.name,
        ibge: m.ibge,
        uf: m.uf,
      })),
      server_now: this.clock().toISOString(),
    };
  }

  async search(intentIn: SearchIntent): Promise<SearchResponse> {
    const { intent, applied } = this.applyPlace(intentIn);
    const t0 = Date.now();
    const now = this.clock();
    const q = intent.q?.trim() || undefined;
    const from = this.fromClause(intent);

    const params: unknown[] = [];
    const where = this.where(intent, params);
    const qParam = q ? 1 : null; // `q` é sempre o primeiro parâmetro quando existe
    const offset = (intent.page - 1) * intent.limit;

    const listParams = [...params, intent.limit, offset];
    const list = this.db.query<SummaryRow>(
      `SELECT ${SUMMARY_COLUMNS} ${from} ${where}
       ORDER BY ${this.orderBy(intent, qParam)}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams,
    );
    const total = this.db.query<{ n: string }>(`SELECT count(*) AS n ${from} ${where}`, params);

    const facet = async (col: 'p.uf' | 'p.modality', omit: Omit_) => {
      const fp: unknown[] = [];
      const fw = this.where(intent, fp, omit);
      const label = col === 'p.uf' ? 'p.uf' : 'max(p.modality_name)';
      const r = await this.db.query<{ v: string | null; label: string | null; n: string }>(
        `SELECT ${col}::text AS v, ${label}::text AS label, count(*) AS n ${from} ${fw}
         GROUP BY ${col} ORDER BY count(*) DESC LIMIT 40`,
        fp,
      );
      return r.rows
        .filter((x) => x.v !== null)
        .map((x) => ({
          value: x.v as string,
          label: x.label ?? (x.v as string),
          count: Number(x.n),
        }));
    };
    const wantsFacets = new Set(intent.facets);
    const [listRes, totalRes, ufFacet, modFacet, freshness] = await Promise.all([
      list,
      total,
      wantsFacets.has('uf') ? facet('p.uf', 'uf') : Promise.resolve([]),
      wantsFacets.has('modality') ? facet('p.modality', 'modality') : Promise.resolve([]),
      this.indexFreshness(),
    ]);

    return {
      items: listRes.rows.map((r) => toSummary(r, now, q)),
      facets: { uf: ufFacet, modality: modFacet },
      page: intent.page,
      page_size: intent.limit,
      meta: {
        total_estimate: Number(totalRes.rows[0]?.n ?? 0),
        total_exact: true,
        // Perna semântica ainda não existe: 'skipped' (não é falha, então `degraded` fica vazio).
        legs: { lexical: q ? 'ok' : 'skipped', semantic: 'skipped', rerank: 'skipped' },
        degraded: [],
        index_freshness_at: (freshness ?? now).toISOString(),
        took_ms: Date.now() - t0,
        applied,
      },
      server_now: now.toISOString(),
    };
  }

  /** Ids que casam com a busca (mesmos filtros duros, cobertura CE/PI), dos mais novos para os mais antigos. Usado pelos monitores. */
  async matchIds(intent: SearchIntent, limit = 500): Promise<string[]> {
    const params: unknown[] = [];
    const where = this.where(intent, params);
    const r = await this.db.query<{ id: string }>(
      `SELECT p.id ${this.fromClause(intent)} ${where}
       ORDER BY p.published_at DESC NULLS LAST, p.id LIMIT $${params.length + 1}`,
      [...params, limit],
    );
    return r.rows.map((x) => x.id);
  }

  private async indexFreshness(): Promise<Date | null> {
    const nowMs = Date.now();
    if (nowMs - this.freshness.read < 60_000) return this.freshness.at;
    const r = await this.db.query<{ at: Date | null }>(
      'SELECT max(updated_at) AS at FROM procurements',
    );
    this.freshness = { at: r.rows[0]?.at ?? null, read: nowMs };
    return this.freshness.at;
  }

  async detail(id: string): Promise<ProcurementDetail> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DomainError('not_found', 'Edital não encontrado');
    const r = await this.db.query<DetailRow>(
      `SELECT ${DETAIL_COLUMNS} FROM procurements p JOIN organs o ON o.cnpj = p.organ_cnpj WHERE p.id = $1 AND p.uf = ANY($2)`,
      [id, COVERED],
    );
    const row = r.rows[0];
    if (!row) throw new DomainError('not_found', 'Edital não encontrado');
    return toDetail(row, this.clock());
  }

  /** Sugestões enquanto digita, correção ortográfica por trigramas e órgãos (docs/06 §3). */
  async suggest(qRaw: string): Promise<SuggestResponse> {
    const now = this.clock();
    const q = qRaw.trim().slice(0, 100);
    const empty: SuggestResponse = {
      terms: [],
      did_you_mean: null,
      organs: [],
      server_now: now.toISOString(),
    };
    if (q.length < 2) return empty;

    const tokens = fold(q).split(/\s+/).filter(Boolean);
    const last = tokens.at(-1) ?? '';
    const head = tokens.slice(0, -1).join(' ');
    const join = (term: string) => (head ? `${head} ${term}` : term);

    const terms: string[] = [];
    let prefixHits = 0;
    for (const s of SYNONYMS[last] ?? []) terms.push(join(s));
    if (last.length >= 2) {
      const r = await this.db.query<{ term: string }>(
        `SELECT term FROM search_vocab WHERE term LIKE $1 AND term <> $2 ORDER BY freq DESC LIMIT 6`,
        [`${last.replace(/[%_]/g, '')}%`, last],
      );
      for (const x of r.rows) terms.push(join(x.term));
      prefixHits = r.rows.length;
    }

    let didYouMean: string | null = null;
    // Só corrige quando nada começa com o que foi digitado: "medicam" é palavra pela metade, não erro.
    if (last.length >= 4 && prefixHits === 0) {
      const known = await this.db.query('SELECT 1 FROM search_vocab WHERE term = $1', [last]);
      if (known.rowCount === 0) {
        const r = await this.db.query<{ term: string }>(
          `SELECT term FROM search_vocab WHERE similarity(term, $1) >= 0.45 ORDER BY similarity(term, $1) DESC, freq DESC LIMIT 1`,
          [last],
        );
        if (r.rows[0]) didYouMean = join(r.rows[0].term);
      }
    }

    const organs =
      q.length >= 3
        ? (await this.organs(q, 4)).organs.map((o) => ({ cnpj: o.cnpj, name: o.name }))
        : [];
    return {
      terms: [...new Set(terms)].slice(0, 8),
      did_you_mean: didYouMean,
      organs,
      server_now: now.toISOString(),
    };
  }

  async organs(qRaw: string, limit = 10): Promise<OrganSuggestResponse> {
    const q = qRaw.trim().slice(0, 100);
    const now = this.clock();
    if (q.length < 2) return { organs: [], server_now: now.toISOString() };
    const r = await this.db.query<{ cnpj: string; name: string; uf: string | null }>(
      `SELECT o.cnpj, o.name, o.uf FROM organs o
       WHERE o.uf = ANY($3) AND immutable_unaccent(lower(o.name)) LIKE '%' || immutable_unaccent(lower($1)) || '%'
       ORDER BY (SELECT count(*) FROM procurements p WHERE p.organ_cnpj = o.cnpj) DESC, o.name
       LIMIT $2`,
      [q.replace(/[%_]/g, ''), limit, COVERED],
    );
    return { organs: r.rows, server_now: now.toISOString() };
  }
}
