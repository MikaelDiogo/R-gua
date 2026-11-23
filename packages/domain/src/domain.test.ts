import { describe, expect, it } from 'vitest';
import { businessDaysBetween, computeDeadline, subtractBusinessDays } from './deadline';
import { canTransition } from './pipeline';

const d = (s: string) => new Date(s);

describe('dias úteis', () => {
  it('não conta hoje, conta o dia do encerramento, pula fim de semana', () => {
    expect(businessDaysBetween('2026-11-03', '2026-11-03')).toBe(0);
    expect(businessDaysBetween('2026-11-03', '2026-11-04')).toBe(1);
    expect(businessDaysBetween('2026-11-06', '2026-11-09')).toBe(1);
  });
  it('pula feriados nacionais (2/11 e 20/11)', () => {
    expect(businessDaysBetween('2026-10-30', '2026-11-03')).toBe(1);
    expect(businessDaysBetween('2026-11-19', '2026-11-23')).toBe(1);
  });
});

describe('computeDeadline', () => {
  const now = d('2026-11-03T15:55:00Z'); // 12:55 em Brasília
  it('sem data é unknown', () => {
    expect(computeDeadline(null, null, now).level).toBe('unknown');
  });
  it('encerrado', () => {
    const r = computeDeadline(d('2026-10-01T12:00:00Z'), d('2026-11-02T12:00:00Z'), now);
    expect(r).toMatchObject({ level: 'closed', label: 'encerrado em 02/11' });
  });
  it('hoje é crítico e mostra a hora de Brasília', () => {
    const r = computeDeadline(null, d('2026-11-03T20:00:00Z'), now);
    expect(r).toMatchObject({ level: 'critical', label: 'encerra hoje · 17:00', business_days: 0 });
  });
  it('em 3 dias úteis é soon, com dia da semana e data', () => {
    const r = computeDeadline(null, d('2026-11-06T20:00:00Z'), now);
    expect(r).toMatchObject({ level: 'soon', business_days: 3 });
    expect(r.label).toBe('encerra em 3 dias úteis · sex 06/11 17:00');
  });
  it('depois de 5 dias úteis é ok', () => {
    expect(computeDeadline(null, d('2026-11-25T20:00:00Z'), now).level).toBe('ok');
  });
  it('progresso entre abertura e encerramento', () => {
    const r = computeDeadline(d('2026-11-01T15:55:00Z'), d('2026-11-05T15:55:00Z'), now);
    expect(r.progress).toBeCloseTo(0.5, 5);
  });
});

describe('transições do pipeline', () => {
  it('etapas ativas são livres', () => {
    expect(canTransition('descoberto', 'em_preparacao', 'member').ok).toBe(true);
    expect(canTransition('em_disputa', 'em_analise', 'member').ok).toBe(true);
  });
  it('ganho só vem de em_disputa; perdido só depois da proposta', () => {
    expect(canTransition('em_analise', 'ganho', 'member').ok).toBe(false);
    expect(canTransition('em_disputa', 'ganho', 'member').ok).toBe(true);
    expect(canTransition('em_analise', 'perdido', 'member').ok).toBe(false);
    expect(canTransition('proposta_enviada', 'perdido', 'member').ok).toBe(true);
  });
  it('descartar só antes da proposta', () => {
    expect(canTransition('em_preparacao', 'descartado', 'member').ok).toBe(true);
    expect(canTransition('em_disputa', 'descartado', 'member').ok).toBe(false);
  });
  it('card final só reabre por admin, e viewer não move', () => {
    expect(canTransition('ganho', 'em_analise', 'member').ok).toBe(false);
    expect(canTransition('ganho', 'em_analise', 'admin').ok).toBe(true);
    expect(canTransition('descoberto', 'em_analise', 'viewer').ok).toBe(false);
  });
  it('mesma etapa é recusada', () => {
    expect(canTransition('em_analise', 'em_analise', 'owner').ok).toBe(false);
  });
});

describe('subtractBusinessDays', () => {
  it('3 dias úteis antes de uma segunda cai na quarta anterior', () => {
    expect(subtractBusinessDays('2026-11-09', 3)).toBe('2026-11-04');
  });
  it('pula feriado nacional (2/11) e fim de semana', () => {
    expect(subtractBusinessDays('2026-11-04', 3)).toBe('2026-10-29');
  });
});
