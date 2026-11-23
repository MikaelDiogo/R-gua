import { describe, expect, it } from 'vitest';
import { buildQuery, relevantSources, scoreFromCriteria, scrubIds } from './ai-search.service';

describe('buildQuery', () => {
  it('junta termos com OR e põe frases entre aspas, sem operadores injetados', () => {
    expect(buildQuery(['ar condicionado', 'split', 'split'])).toBe('"ar condicionado" or split');
    expect(buildQuery(['-carne', 'a" or "b'])).not.toContain('-');
  });
});

describe('scoreFromCriteria', () => {
  it('atende=1, em parte=0,5, o resto 0', () => {
    expect(scoreFromCriteria(['meets', 'meets', 'meets', 'meets'])).toBe(100);
    expect(scoreFromCriteria(['meets', 'partial', 'unknown', 'missing'])).toBe(38);
    expect(scoreFromCriteria([])).toBe(0);
  });
});

describe('scrubIds', () => {
  const map = new Map([
    ['d251265b-e6b4-4bdc-a678-f82ea73a8573', { organ: { name: 'Município X' } }],
  ]);
  it('troca o id interno pelo órgão, e ids desconhecidos por texto neutro', () => {
    expect(scrubIds('O edital d251265b-e6b4-4bdc-a678-f82ea73a8573 serve', map)).toBe(
      'O edital de Município X serve',
    );
    expect(scrubIds('veja 11111111-1111-4111-8111-111111111111', map)).toBe('veja este edital');
  });
});

describe('relevantSources', () => {
  const s = (title: string, url: string) => ({ title, url, host: new URL(url).host, snippet: '' });
  it('mantém fonte que cita o órgão e descarta ruído de outro lugar', () => {
    const out = relevantSources('MUNICIPIO DE ASSIS CHATEAUBRIAND', null, [
      s('Edital Assis Chateaubriand', 'https://assischateaubriand.pr.gov.br/x'),
      s('Pregão em Herval d Oeste', 'https://hervaldoeste.sc.gov.br/y'),
    ]);
    expect(out.map((x) => x.host)).toEqual(['assischateaubriand.pr.gov.br']);
  });
  it('usa o município quando o nome do órgão é genérico, e sem termo distintivo não confirma nada', () => {
    const src = [
      s('Locação em Recife', 'https://recife.pe.gov.br/a'),
      s('Herval d Oeste', 'https://hervaldoeste.sc.gov.br/b'),
    ];
    expect(relevantSources('FUNDO MUNICIPAL DE SAUDE', 'Recife', src).map((x) => x.host)).toEqual([
      'recife.pe.gov.br',
    ]);
    expect(relevantSources('FUNDO MUNICIPAL DE SAUDE', null, src)).toEqual([]);
  });
});
