import { beforeEach, describe, expect, it } from 'vitest';
import { fakeDb } from './fake-db.test-util';
import { EP_PROPOSTA, EP_PUBLICACAO } from './pncp/connector';
import { fakeFetch, testClient } from './pncp/helpers.test-util';
import { servePaged } from './pncp/serve.test-util';
import { __resetRefreshState, refreshMunicipality } from './refresh';

const IBGE = '2304103'; // Crateús
const NOW = new Date('2026-11-23T15:00:00Z');
const now = () => NOW;

beforeEach(() => __resetRefreshState());

describe('refreshMunicipality (coleta ao vivo por cidade)', () => {
  it('só abertas: UMA consulta, sem modalidade, filtrando pelo município', async () => {
    const { fn, calls } = servePaged(7, 'C', IBGE);
    const { client } = testClient(fn);
    const f = fakeDb();
    const r = await refreshMunicipality(f.db, IBGE, { client, now });
    expect(r).toEqual({ fetched: 7, upserted: 7, complete: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.pathname.endsWith(EP_PROPOSTA)).toBe(true);
    expect(calls[0]?.searchParams.get('codigoMunicipioIbge')).toBe(IBGE);
    expect(calls[0]?.searchParams.has('codigoModalidadeContratacao')).toBe(false);
    expect(f.known.size).toBe(7);
  });

  it('com days: abertas + publicadas no período, uma chamada por modalidade, mais comuns primeiro', async () => {
    const { fn, calls } = fakeFetch(() => new Response(null, { status: 204 }));
    const { client } = testClient(fn);
    const r = await refreshMunicipality(fakeDb().db, IBGE, {
      client,
      now,
      days: 90,
      maxMs: 60_000,
    });
    expect(r.complete).toBe(true);
    expect(calls).toHaveLength(1 + 13);
    const pub = calls.filter((u) => u.pathname.endsWith(EP_PUBLICACAO));
    expect(pub[0]?.searchParams.get('codigoModalidadeContratacao')).toBe('8');
    expect(pub[0]?.searchParams.get('dataInicial')).toBe('20260826'); // 90 dias contando hoje
    expect(pub[0]?.searchParams.get('dataFinal')).toBe('20261123');
    expect(pub.every((u) => u.searchParams.get('codigoMunicipioIbge') === IBGE)).toBe(true);
  });

  it('prazo curto: devolve o que conseguiu com complete=false, sem lançar', async () => {
    const slow = fakeFetch(async () => {
      await new Promise((r) => setTimeout(r, 120));
      return new Response(null, { status: 204 });
    });
    const { client } = testClient(slow.fn);
    // Relógio real: o prazo é medido por ele, e cada chamada leva 120 ms.
    const r = await refreshMunicipality(fakeDb().db, IBGE, { client, days: 30, maxMs: 200 });
    expect(r.complete).toBe(false);
    expect(slow.calls.length).toBeLessThan(14);
  });

  it('erro do PNCP não lança: devolve complete=false', async () => {
    const { fn } = fakeFetch(() => new Response('erro', { status: 500 }));
    const { client } = testClient(fn);
    const r = await refreshMunicipality(fakeDb().db, IBGE, { client, now });
    expect(r.complete).toBe(false);
    expect(r.fetched).toBe(0);
  });

  it('erro de banco não lança', async () => {
    const { fn } = servePaged(3, 'D', IBGE);
    const { client } = testClient(fn);
    const bad = {
      connect: async () => {
        throw new Error('banco fora');
      },
      query: async () => ({ rows: [], rowCount: 0 }),
    };
    const r = await refreshMunicipality(bad as never, IBGE, { client, now });
    expect(r.complete).toBe(false);
  });

  it('duas chamadas simultâneas para a mesma cidade dividem a mesma coleta', async () => {
    const { fn, calls } = servePaged(5, 'E', IBGE);
    const { client } = testClient(fn);
    const f = fakeDb();
    const [a, b] = await Promise.all([
      refreshMunicipality(f.db, IBGE, { client, now }),
      refreshMunicipality(f.db, IBGE, { client, now }),
    ]);
    expect(a).toEqual(b);
    expect(calls).toHaveLength(1);
  });
});
