import { describe, expect, it } from 'vitest';
import { formatCnpj, isValidCnpj } from './cnpj';
import { confidenceOf, quantile, robustStats, simulatePrice } from './pricing';

describe('simulatePrice', () => {
  it('margem sobre o preço: custo 100, impostos 10%, margem 20% => preço 142,86', () => {
    const s = simulatePrice({ cost: 100, taxes_pct: 10, margin_pct: 20, quantity: 1 });
    expect(s.target_price).toBe(142.86);
    expect(s.profit_at_target).toBe(28.57); // 20% de 142,86
    expect(s.break_even_price).toBe(111.11); // 100 / 0,9
  });
  it('multiplica pela quantidade', () => {
    const s = simulatePrice({ cost: 100, taxes_pct: 0, margin_pct: 20, quantity: 10 });
    expect(s.target_price).toBe(125);
    expect(s.total_at_target).toBe(1250);
    expect(s.profit_at_target).toBe(250);
  });
  it('cenários ordenados do menor ao maior preço e o empate tem lucro 0', () => {
    const s = simulatePrice({ cost: 50, taxes_pct: 8, margin_pct: 20, quantity: 3 });
    const prices = s.scenarios.map((x) => x.unit_price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    expect(s.scenarios[0]?.profit).toBe(0);
  });
  it('recusa impostos + margem >= 100%', () => {
    expect(() => simulatePrice({ cost: 1, taxes_pct: 60, margin_pct: 40, quantity: 1 })).toThrow();
  });
});

describe('estatística robusta', () => {
  it('quantis por interpolação', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([], 0.5)).toBeNull();
  });
  it('remove outliers (1,5 × IQR) e zeros, e conta quantos saíram', () => {
    const s = robustStats([10, 11, 12, 10, 11, 9999, 0, -3]);
    expect(s.outliers_removed).toBe(1);
    expect(s.n).toBe(5);
    expect(s.median).toBe(11);
  });
  it('confiança: sem amostra, baixa com n pequeno, alta com n grande e pouca dispersão', () => {
    expect(confidenceOf(robustStats([]))).toBe('none');
    expect(confidenceOf(robustStats([10, 11]))).toBe('low');
    expect(confidenceOf(robustStats(Array.from({ length: 20 }, (_, i) => 100 + (i % 5))))).toBe(
      'high',
    );
    expect(confidenceOf(robustStats(Array.from({ length: 8 }, (_, i) => 100 + i * 2)))).toBe(
      'medium',
    );
  });
});

describe('CNPJ', () => {
  it('valida pelos dígitos verificadores', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
    expect(isValidCnpj('123')).toBe(false);
  });
  it('formata', () => {
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });
});
