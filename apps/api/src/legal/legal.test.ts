import { describe, expect, it } from 'vitest';
import { legalDeadline } from './legal.service';

describe('prazo de impugnação (art. 164)', () => {
  it('3 dias úteis antes da abertura, pulando fim de semana e feriado nacional', () => {
    // abertura segunda 09/11/2026 12:00 BRT → 3 dias úteis antes = quarta 04/11
    const d = legalDeadline('impugnation', new Date('2026-11-09T15:00:00Z'));
    expect(d.label).toContain('04/11/2026');
    expect(d.due_at).toBe('2026-11-05T02:59:59.000Z'); // 23:59:59 de 04/11 em Brasília
    expect(d.validate_with_legal).toBe(true);
  });
  it('sem data de abertura não inventa data', () => {
    const d = legalDeadline('impugnation', null);
    expect(d.due_at).toBeNull();
    expect(d.basis).toContain('não informa');
  });
  it('recurso e contrarrazões dependem da ciência do ato, e dizem isso', () => {
    expect(legalDeadline('appeal', new Date()).due_at).toBeNull();
    expect(legalDeadline('counter_arguments', null).label).toContain('intimação');
  });
});

import { isOfficialLegalHost } from './legal.service';

describe('fontes jurídicas oficiais', () => {
  it('aceita só planalto e tcu; recusa outros gov.br (editais, prefeituras, PNCP)', () => {
    expect(isOfficialLegalHost('www.planalto.gov.br')).toBe(true);
    expect(isOfficialLegalHost('portal.tcu.gov.br')).toBe(true);
    expect(isOfficialLegalHost('pesquisa.apps.tcu.gov.br')).toBe(true);
    expect(isOfficialLegalHost('pncp.gov.br')).toBe(false);
    expect(isOfficialLegalHost('saaebambiental.sp.gov.br')).toBe(false);
    expect(isOfficialLegalHost('planalto.gov.br.evil.com')).toBe(false);
  });
});
