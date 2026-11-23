import { describe, expect, it } from 'vitest';
import { EP_PUBLICACAO } from './connector';
import { recentWindows, registryWindow } from './windows';

const NOW = new Date('2026-11-23T15:00:00Z'); // 23/11/2026 12:00 em Brasília

describe('recentWindows', () => {
  it('cobre os N dias sem buracos nem sobreposição, da semana mais recente para a mais antiga', () => {
    const ws = recentWindows({ days: 21, ufs: ['CE'], modalities: [6], now: NOW });
    expect(ws.map((w) => [w.start, w.end])).toEqual([
      ['20261117', '20261123'],
      ['20261110', '20261116'],
      ['20261103', '20261109'],
    ]);
  });

  it('a janela mais antiga é cortada no limite (sem passar dos N dias)', () => {
    const ws = recentWindows({ days: 10, ufs: ['CE'], modalities: [6], now: NOW });
    expect(ws.map((w) => [w.start, w.end])).toEqual([
      ['20261117', '20261123'],
      ['20261114', '20261116'],
    ]);
  });

  it('cada semana vira UF × modalidade, todas as 13 por padrão, no endpoint de publicação', () => {
    const ws = recentWindows({ days: 7, ufs: ['CE', 'PI'], now: NOW });
    expect(ws).toHaveLength(2 * 13);
    expect(new Set(ws.map((w) => w.endpoint))).toEqual(new Set([EP_PUBLICACAO]));
    expect(new Set(ws.map((w) => w.uf))).toEqual(new Set(['CE', 'PI']));
    expect(new Set(ws.map((w) => w.modality)).size).toBe(13);
  });

  it('180 dias de CE e PI = 26 semanas × 2 UF × 13 modalidades', () => {
    expect(recentWindows({ days: 180, ufs: ['CE', 'PI'], now: NOW })).toHaveLength(26 * 2 * 13);
  });

  it('windowDays configurável e days mínimo 1', () => {
    expect(recentWindows({ days: 1, ufs: ['CE'], modalities: [6], now: NOW })).toHaveLength(1);
    const ws = recentWindows({ days: 6, windowDays: 2, ufs: ['CE'], modalities: [6], now: NOW });
    expect(ws.map((w) => [w.start, w.end])).toEqual([
      ['20261122', '20261123'],
      ['20261120', '20261121'],
      ['20261118', '20261119'],
    ]);
  });
});

describe('registryWindow', () => {
  it('UF e município entram no endpoint (a tabela não tem coluna para eles)', () => {
    const base = { source: 'pncp', endpoint: EP_PUBLICACAO, start: '20261101', end: '20261107' };
    expect(registryWindow({ ...base, uf: 'CE' }).endpoint).toBe(`${EP_PUBLICACAO}?uf=CE`);
    expect(registryWindow({ ...base, municipalityIbge: '2304103' }).endpoint).toBe(
      `${EP_PUBLICACAO}?ibge=2304103`,
    );
    expect(registryWindow(base).endpoint).toBe(EP_PUBLICACAO);
  });
});
