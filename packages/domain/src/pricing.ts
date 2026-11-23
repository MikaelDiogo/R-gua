export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface Simulation {
  target_price: number;
  break_even_price: number;
  total_at_target: number;
  profit_at_target: number;
  scenarios: Array<{ label: string; margin_pct: number; unit_price: number; profit: number }>;
}

/**
 * Preço de venda a partir do custo. A margem é sobre o PREÇO (margem líquida): preço = custo / (1 − (impostos + margem)).
 * Calculado no servidor (docs/04 §5); a IA nunca produz o número final. Lança se impostos + margem ≥ 100%.
 */
export function simulatePrice(input: {
  cost: number;
  taxes_pct: number;
  margin_pct: number;
  quantity: number;
}): Simulation {
  const { cost, taxes_pct, margin_pct, quantity } = input;
  if (taxes_pct + margin_pct >= 100) throw new RangeError('impostos e margem somam 100% ou mais');
  const priceFor = (m: number) => cost / (1 - (taxes_pct + m) / 100);
  const profitFor = (m: number) => (priceFor(m) * m) / 100;
  const target = round2(priceFor(margin_pct));
  const mk = (label: string, m: number) => {
    const mm = Math.min(m, 99.99 - taxes_pct);
    return {
      label,
      margin_pct: round2(mm),
      unit_price: round2(priceFor(mm)),
      profit: round2(profitFor(mm) * quantity),
    };
  };
  return {
    target_price: target,
    break_even_price: round2(priceFor(0)),
    total_at_target: round2(target * quantity),
    profit_at_target: round2(profitFor(margin_pct) * quantity),
    scenarios: [
      mk('Sem lucro (empate)', 0),
      mk('Lance agressivo', margin_pct / 2),
      mk('Preço-alvo', margin_pct),
      mk('Com folga', margin_pct * 1.5),
    ],
  };
}

/** Quantil por interpolação linear (método comum de planilhas). `sorted` em ordem crescente. */
export function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (pos - lo);
}

export interface Stats {
  n: number;
  median: number | null;
  q1: number | null;
  q3: number | null;
  min: number | null;
  max: number | null;
  outliers_removed: number;
}

/** Estatística robusta (docs/09 §8): descarta zero/negativo e outliers fora de 1,5 × IQR (com n ≥ 4), e informa quantos saíram. */
export function robustStats(values: number[]): Stats {
  const positive = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  let kept = positive;
  if (positive.length >= 4) {
    const q1 = quantile(positive, 0.25) as number;
    const q3 = quantile(positive, 0.75) as number;
    const iqr = q3 - q1;
    kept = positive.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
  }
  return {
    n: kept.length,
    median: kept.length ? round2(quantile(kept, 0.5) as number) : null,
    q1: kept.length ? round2(quantile(kept, 0.25) as number) : null,
    q3: kept.length ? round2(quantile(kept, 0.75) as number) : null,
    min: kept.length ? round2(kept[0] as number) : null,
    max: kept.length ? round2(kept[kept.length - 1] as number) : null,
    outliers_removed: positive.length - kept.length,
  };
}

/** Confiança da amostra, em palavras. Nunca finge precisão com n pequeno ou dispersão grande. */
export function confidenceOf(s: Stats): 'none' | 'low' | 'medium' | 'high' {
  if (s.n === 0 || s.median === null) return 'none';
  const spread = s.q1 !== null && s.q3 !== null && s.median > 0 ? (s.q3 - s.q1) / s.median : 0;
  if (s.n < 5 || spread > 1) return 'low';
  if (s.n >= 15 && spread <= 0.5) return 'high';
  return 'medium';
}
