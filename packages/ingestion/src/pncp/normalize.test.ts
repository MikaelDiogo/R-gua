import { describe, expect, it } from 'vitest';
import { fixture } from './helpers.test-util';
import { normalizeContratacao } from './normalize';
import { maskPii } from './pii';
import { PncpContratacao } from './schema';
import { brtToUtcIso, fromPncpDate, toPncpDate } from './time';

const NOW = new Date('2026-11-03T13:00:00Z');
const all = [
  ...fixture('publicacao-pregao-eletronico.json').data,
  ...fixture('proposta-aberta.json').data,
  ...fixture('proposta-sem-modalidade.json').data,
] as any[];

describe('tempo (PNCP devolve datas sem fuso, em America/Sao_Paulo)', () => {
  it('converte para UTC somando 3h', () => {
    expect(brtToUtcIso('2026-11-01T02:14:33')).toBe('2026-11-01T05:14:33.000Z');
    expect(brtToUtcIso('2026-11-01T02:14:33Z')).toBe('2026-11-01T02:14:33.000Z');
    expect(brtToUtcIso(null)).toBeNull();
    expect(brtToUtcIso('lixo')).toBeNull();
  });

  it('usa o dia civil de Brasília no formato yyyyMMdd', () => {
    expect(toPncpDate(new Date('2026-11-03T02:00:00Z'))).toBe('20261102'); // ainda é dia 2 em Brasília
    expect(toPncpDate(new Date('2026-11-03T13:00:00Z'))).toBe('20261103');
    expect(fromPncpDate('20261103').toISOString()).toBe('2026-11-03T03:00:00.000Z');
  });
});

describe('LGPD: máscara de CPF', () => {
  it('mascara CPF formatado e CPF com rótulo', () => {
    expect(maskPii('contato 123.456.789-09 aqui').text).toBe('contato [CPF omitido] aqui');
    expect(maskPii('CPF: 12345678909').text).toBe('CPF: [CPF omitido]');
    expect(maskPii('x 123.456.789-09').masked).toBe(true);
  });

  it('não mascara número de 11 dígitos sem contexto (caso real: emenda parlamentar)', () => {
    const real = 'TRANSFERÊNCIA ESPECIAL DE EMENDA PARLAMENTAR Nº 20269048000';
    expect(maskPii(real)).toEqual({ text: real, masked: false });
  });
});

describe('normalização de dados reais do PNCP', () => {
  const normalized = all.map((r) => normalizeContratacao(PncpContratacao.parse(r), NOW));

  it('todos os registros reais das fixtures passam no schema e normalizam', () => {
    expect(normalized).toHaveLength(all.length);
    for (const n of normalized) {
      expect(n.numeroControlePncp).toMatch(/^\d{14}-\d-\d{6}\/\d{4}$/);
      expect(n.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(n.sourceUrl).toContain(n.organ.cnpj);
    }
  });

  it('converte datas para UTC e deriva o estado pelas datas', () => {
    const rec = all.find((r) => r.numeroControlePNCP === '94436342000100-1-000058/2026');
    const n = normalizeContratacao(PncpContratacao.parse(rec), NOW);
    expect(n.publishedAt).toBe('2026-11-01T05:14:33.000Z');
    expect(n.proposalsCloseAt).toBe('2026-07-17T12:00:00.000Z');
    expect(n.status).toBe('closed'); // "Divulgada", mas o prazo já passou
    expect(n.isOpen).toBe(false);
    expect(n.organ).toMatchObject({ uf: 'RS', sphere: 'municipal', municipalityIbge: '4311775' });
    expect(n.modalityName).toBe('Pregão - Eletrônico');
  });

  it('registro revogado vira canceled e nunca aberto', () => {
    const revogados = normalized.filter((n) => n.statusRaw === 'Revogada');
    expect(revogados.length).toBeGreaterThan(0);
    for (const n of revogados) {
      expect(n.status).toBe('canceled');
      expect(n.isOpen).toBe(false);
    }
  });

  it('sinaliza valor zerado ou negativo como value_suspect (acontece nos dados reais)', () => {
    const esperados = all.filter(
      (r) => typeof r.valorTotalEstimado === 'number' && r.valorTotalEstimado <= 0,
    ).length;
    expect(esperados).toBeGreaterThan(0);
    expect(normalized.filter((n) => n.qualityFlags.includes('value_suspect'))).toHaveLength(
      esperados,
    );
  });

  it('o hash de conteúdo é estável e muda quando o prazo muda', () => {
    const base = PncpContratacao.parse(all[0]);
    const a = normalizeContratacao(base, NOW);
    expect(normalizeContratacao(base, NOW).contentHash).toBe(a.contentHash);
    const moved = { ...base, dataEncerramentoProposta: '2027-01-01T10:00:00' };
    expect(normalizeContratacao(moved, NOW).contentHash).not.toBe(a.contentHash);
  });

  it('data absurda e prazo invertido geram flags', () => {
    const base = PncpContratacao.parse(all[0]);
    const n = normalizeContratacao(
      {
        ...base,
        dataAberturaProposta: '2026-12-10T10:00:00',
        dataEncerramentoProposta: '2026-12-01T10:00:00',
        dataPublicacaoPncp: '1999-01-01T00:00:00',
      },
      NOW,
    );
    expect(n.qualityFlags).toEqual(
      expect.arrayContaining(['date_suspect', 'proposal_dates_inverted']),
    );
  });

  it('mascara CPF no objeto antes do hash/índice e guarda o original', () => {
    const base = PncpContratacao.parse(all[0]);
    const n = normalizeContratacao(
      { ...base, objetoCompra: 'Aquisição, responsável CPF 111.222.333-44' },
      NOW,
    );
    expect(n.objectText).not.toContain('111.222');
    expect(n.qualityFlags).toContain('pii_masked');
  });
});
