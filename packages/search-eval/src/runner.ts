import { type Judgments, mean, ndcgAtK, recallAtK, reciprocalRank } from './metrics';

export type QueryKind =
  | 'short_term'
  | 'long_description'
  | 'acronym'
  | 'process_number'
  | 'catmat'
  | 'natural_language'
  | 'typo'
  | 'with_filters';

export interface EvalQuery {
  id: string;
  q: string;
  kind: QueryKind;
  /** Filtros estruturados esperados (para consultas em linguagem natural, o que o entendimento deve produzir). */
  expectedFilters?: Record<string, unknown>;
  /** Julgamentos graduados 0 a 3 por id de contratação. Vazio = consulta ainda não julgada. */
  judgments: Judgments;
  notes?: string;
}

export interface EvalSet {
  version: string;
  createdAt: string;
  queries: EvalQuery[];
}

/** O que o sistema avaliado devolve: ids em ordem de ranking. Uma lista vazia só vale como "zero resultados" se `legsOk`. */
export interface SearchOutcome {
  ids: string[];
  /** false quando alguma perna falhou: resultado vazio não conta como zero resultados honestos. */
  legsOk: boolean;
}
export type SearchFn = (q: EvalQuery) => Promise<SearchOutcome>;

export interface QueryResult {
  id: string;
  kind: QueryKind;
  ndcg10: number | null;
  recall50: number | null;
  rr: number | null;
  zeroResults: boolean;
  judged: boolean;
}

export interface EvalReport {
  setVersion: string;
  system: string;
  queries: number;
  judgedQueries: number;
  ndcg10: number | null;
  recall50: number | null;
  mrr: number | null;
  zeroResultRate: number;
  byKind: Record<string, { n: number; ndcg10: number | null }>;
  results: QueryResult[];
}

export async function evaluate(
  system: string,
  set: EvalSet,
  search: SearchFn,
): Promise<EvalReport> {
  const results: QueryResult[] = [];
  for (const q of set.queries) {
    const out = await search(q);
    const judged = Object.keys(q.judgments).length > 0;
    results.push({
      id: q.id,
      kind: q.kind,
      ndcg10: judged ? ndcgAtK(out.ids, q.judgments, 10) : null,
      recall50: judged ? recallAtK(out.ids, q.judgments, 50) : null,
      rr: judged ? reciprocalRank(out.ids, q.judgments) : null,
      zeroResults: out.legsOk && out.ids.length === 0,
      judged,
    });
  }
  const byKind: EvalReport['byKind'] = {};
  for (const kind of new Set(results.map((r) => r.kind))) {
    const rs = results.filter((r) => r.kind === kind);
    byKind[kind] = { n: rs.length, ndcg10: mean(rs.map((r) => r.ndcg10)) };
  }
  return {
    setVersion: set.version,
    system,
    queries: results.length,
    judgedQueries: results.filter((r) => r.judged).length,
    ndcg10: mean(results.map((r) => r.ndcg10)),
    recall50: mean(results.map((r) => r.recall50)),
    mrr: mean(results.map((r) => r.rr)),
    zeroResultRate:
      results.length === 0 ? 0 : results.filter((r) => r.zeroResults).length / results.length,
    byKind,
    results,
  };
}

export interface GateOptions {
  /** Queda relativa tolerada de nDCG@10 (docs/06 §9 sugere -1%). */
  ndcgTolerance?: number;
  recallTolerance?: number;
}

export interface GateResult {
  pass: boolean;
  reasons: string[];
}

/**
 * Gate de merge (docs/06 §9): o candidato não pode piorar nDCG@10 além da tolerância nem o recall@50.
 * Compara conjuntos da mesma versão; sem consultas julgadas não há veredito (falha fechada, não aberta).
 */
export function gate(
  baseline: EvalReport,
  candidate: EvalReport,
  opts: GateOptions = {},
): GateResult {
  const reasons: string[] = [];
  if (baseline.setVersion !== candidate.setVersion) {
    reasons.push(`versões do conjunto diferem (${baseline.setVersion} × ${candidate.setVersion})`);
  }
  if (baseline.ndcg10 === null || candidate.ndcg10 === null) {
    reasons.push('sem consultas julgadas: não há como avaliar');
  } else {
    const tol = opts.ndcgTolerance ?? 0.01;
    if (candidate.ndcg10 < baseline.ndcg10 * (1 - tol)) {
      reasons.push(
        `nDCG@10 caiu de ${baseline.ndcg10.toFixed(4)} para ${candidate.ndcg10.toFixed(4)}`,
      );
    }
  }
  if (baseline.recall50 !== null && candidate.recall50 !== null) {
    const tol = opts.recallTolerance ?? 0;
    if (candidate.recall50 < baseline.recall50 * (1 - tol)) {
      reasons.push(
        `recall@50 caiu de ${baseline.recall50.toFixed(4)} para ${candidate.recall50.toFixed(4)}`,
      );
    }
  }
  return { pass: reasons.length === 0, reasons };
}
