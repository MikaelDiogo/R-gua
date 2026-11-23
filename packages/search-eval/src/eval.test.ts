import { describe, expect, it } from 'vitest';
import { mean, ndcgAtK, recallAtK, reciprocalRank } from './metrics';
import { type EvalSet, evaluate, gate } from './runner';

describe('métricas', () => {
  const j = { a: 3, b: 2, c: 1, d: 0 };

  it('nDCG@k é 1 no ranking ideal e menor se a ordem piora', () => {
    expect(ndcgAtK(['a', 'b', 'c'], j, 3)).toBeCloseTo(1, 10);
    const pior = ndcgAtK(['c', 'b', 'a'], j, 3) as number;
    expect(pior).toBeLessThan(1);
    expect(pior).toBeGreaterThan(0);
  });

  it('nDCG@k vale 0 sem nenhum relevante no topo e null sem julgamento relevante', () => {
    expect(ndcgAtK(['x', 'y'], j, 2)).toBe(0);
    expect(ndcgAtK(['a'], { a: 0 }, 5)).toBeNull();
  });

  it('nDCG@k bate com o cálculo manual', () => {
    // ganhos 2^r-1: a=7, c=1; ideal = [a(7), b(3), c(1)]
    const dcg = (1 / Math.log2(2)) * 7 + (1 / Math.log2(4)) * 1; // ranking [a, x, c]
    const idcg = 7 + 3 / Math.log2(3) + 1 / 2;
    expect(ndcgAtK(['a', 'x', 'c'], j, 3)).toBeCloseTo(dcg / idcg, 10);
  });

  it('recall@k considera relevante a partir de 2', () => {
    expect(recallAtK(['a', 'x'], j, 2)).toBe(0.5); // relevantes: a, b
    expect(recallAtK(['a', 'b'], j, 2)).toBe(1);
    expect(recallAtK(['a'], { c: 1 }, 5)).toBeNull();
  });

  it('MRR: posição do primeiro relevante', () => {
    expect(reciprocalRank(['x', 'b'], j)).toBe(0.5);
    expect(reciprocalRank(['x', 'y'], j)).toBe(0);
    expect(reciprocalRank(['a'], {})).toBeNull();
  });

  it('média ignora consultas sem julgamento', () => {
    expect(mean([1, null, 0.5])).toBe(0.75);
    expect(mean([null])).toBeNull();
  });
});

const set: EvalSet = {
  version: 'test-1',
  createdAt: '2026-11-03',
  queries: [
    { id: 'q1', q: 'notebook', kind: 'short_term', judgments: { a: 3, b: 2, c: 0 } },
    { id: 'q2', q: 'TI CE', kind: 'acronym', judgments: { d: 3 } },
    { id: 'q3', q: 'sem julgamento', kind: 'typo', judgments: {} },
  ],
};

describe('avaliador e gate', () => {
  const bom = async (q: { id: string }) => ({
    ids: q.id === 'q1' ? ['a', 'b'] : q.id === 'q2' ? ['d'] : [],
    legsOk: true,
  });
  const ruim = async (q: { id: string }) => ({
    ids: q.id === 'q1' ? ['c', 'x'] : q.id === 'q2' ? ['x'] : [],
    legsOk: true,
  });

  it('agrega por consulta julgada e por tipo', async () => {
    const r = await evaluate('bom', set, bom);
    expect(r.judgedQueries).toBe(2);
    expect(r.ndcg10).toBeCloseTo(1, 10);
    expect(r.mrr).toBe(1);
    expect(r.byKind.short_term?.n).toBe(1);
  });

  it('zero resultados só conta quando as pernas responderam ok', async () => {
    const falhou = await evaluate('falhou', set, async () => ({ ids: [], legsOk: false }));
    expect(falhou.zeroResultRate).toBe(0); // vazio por falha de perna não é "zero resultados"
    const honesto = await evaluate('honesto', set, async () => ({ ids: [], legsOk: true }));
    expect(honesto.zeroResultRate).toBe(1);
  });

  it('gate reprova piora de nDCG e aprova empate', async () => {
    const base = await evaluate('base', set, bom);
    expect(gate(base, await evaluate('igual', set, bom)).pass).toBe(true);
    const g = gate(base, await evaluate('ruim', set, ruim));
    expect(g.pass).toBe(false);
    expect(g.reasons.join(' ')).toContain('nDCG@10');
  });

  it('gate falha fechado sem julgamentos e com conjuntos de versões diferentes', async () => {
    const vazio: EvalSet = {
      ...set,
      queries: [{ id: 'q', q: 'x', kind: 'short_term', judgments: {} }],
    };
    const r = await evaluate('v', vazio, bom);
    expect(gate(r, r).pass).toBe(false);
    const outro = await evaluate('v2', { ...set, version: 'test-2' }, bom);
    expect(gate(await evaluate('b', set, bom), outro).pass).toBe(false);
  });
});
