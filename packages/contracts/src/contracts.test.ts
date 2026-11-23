import { describe, expect, it } from 'vitest';
import { ErrorCode, HTTP_STATUS_BY_CODE, problem, SearchIntent } from './index';

describe('SearchIntent', () => {
  it('aplica defaults', () => {
    const r = SearchIntent.parse({ q: 'notebook' });
    expect(r.mode).toBe('hybrid');
    expect(r.limit).toBe(20);
    expect(r.filters).toEqual({});
  });

  it('rejeita chaves desconhecidas (servidor autoritativo)', () => {
    expect(() => SearchIntent.parse({ q: 'x', org_id: 'abc' })).toThrow();
    expect(() => SearchIntent.parse({ q: 'x', filters: { sql: '1=1' } })).toThrow();
  });

  it('aplica limites', () => {
    expect(() => SearchIntent.parse({ q: 'a'.repeat(501) })).toThrow();
    expect(() => SearchIntent.parse({ limit: 51 })).toThrow();
    expect(() => SearchIntent.parse({ filters: { modality: [14] } })).toThrow();
  });
});

describe('erros', () => {
  it('todo código tem status HTTP de erro', () => {
    for (const code of ErrorCode.options) {
      expect(HTTP_STATUS_BY_CODE[code]).toBeGreaterThanOrEqual(400);
    }
  });

  it('monta problem+json com request_id', () => {
    const p = problem('quota_exceeded', 'Cota esgotada', 'req-1');
    expect(p.status).toBe(429);
    expect(p.code).toBe('quota_exceeded');
    expect(p.request_id).toBe('req-1');
  });
});
