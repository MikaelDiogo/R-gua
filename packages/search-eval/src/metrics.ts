/**
 * Métricas de relevância (docs/06 §9). Julgamentos graduados 0 a 3:
 * 0 irrelevante · 1 marginal · 2 relevante · 3 resposta ideal.
 */
export type Judgments = Record<string, number>;

const gain = (rel: number) => 2 ** rel - 1;

/** nDCG@k com ganho exponencial. Retorna null quando a consulta não tem nenhum item relevante julgado (não entra na média). */
export function ndcgAtK(ranked: string[], judgments: Judgments, k: number): number | null {
  const ideal = Object.values(judgments)
    .filter((r) => r > 0)
    .sort((a, b) => b - a)
    .slice(0, k);
  if (ideal.length === 0) return null;
  const dcg = (rels: number[]) => rels.reduce((s, r, i) => s + gain(r) / Math.log2(i + 2), 0);
  const actual = ranked.slice(0, k).map((id) => judgments[id] ?? 0);
  return dcg(actual) / dcg(ideal);
}

/** Recall@k sobre os itens com relevância >= `minRel` (padrão 2: "relevante"). null se não há nenhum. */
export function recallAtK(
  ranked: string[],
  judgments: Judgments,
  k: number,
  minRel = 2,
): number | null {
  const relevant = Object.entries(judgments)
    .filter(([, r]) => r >= minRel)
    .map(([id]) => id);
  if (relevant.length === 0) return null;
  const top = new Set(ranked.slice(0, k));
  return relevant.filter((id) => top.has(id)).length / relevant.length;
}

/** Reciprocal rank do primeiro item com relevância >= `minRel`; 0 se nenhum aparece. null se a consulta não tem relevante. */
export function reciprocalRank(ranked: string[], judgments: Judgments, minRel = 2): number | null {
  if (!Object.values(judgments).some((r) => r >= minRel)) return null;
  const i = ranked.findIndex((id) => (judgments[id] ?? 0) >= minRel);
  return i === -1 ? 0 : 1 / (i + 1);
}

export const mean = (xs: Array<number | null>): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length === 0 ? null : v.reduce((a, b) => a + b, 0) / v.length;
};
