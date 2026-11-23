import { describe, expect, it } from 'vitest';
import { fakeFetch, json } from './helpers.test-util';
import { PncpPublicApi } from './public-api';

const api = (fn: typeof fetch) =>
  new PncpPublicApi({ fetch: fn, sleep: async () => {}, now: () => 0 });
const item = (n: number) => ({
  numeroItem: n,
  descricao: `Item ${n}`,
  quantidade: 2,
  valorUnitarioEstimado: 10,
  valorTotal: 20,
});

describe('PncpPublicApi', () => {
  it('pagina os itens até a última página', async () => {
    const { fn, calls } = fakeFetch((u) => {
      const p = Number(u.searchParams.get('pagina'));
      return json(p === 1 ? Array.from({ length: 100 }, (_, i) => item(i + 1)) : [item(101)]);
    });
    const r = await api(fn).items('123', 2026, 1);
    expect(r.ok && r.data.length).toBe(101);
    expect(calls).toHaveLength(2);
  });

  it('erro de rede ou 429 nunca vira "sem itens"', async () => {
    const r429 = await api(fakeFetch(() => new Response('x', { status: 429 })).fn).items(
      '1',
      2026,
      1,
    );
    expect(r429).toMatchObject({ ok: false, error: 'rate_limited' });
    const r500 = await api(fakeFetch(() => new Response('x', { status: 500 })).fn).items(
      '1',
      2026,
      1,
    );
    expect(r500.ok).toBe(false);
  });

  it('item fora do contrato é schema_mismatch', async () => {
    const r = await api(fakeFetch(() => json([{ foo: 1 }])).fn).items('1', 2026, 1);
    expect(r).toMatchObject({ ok: false, error: 'schema_mismatch' });
  });

  it('download recusa host de fora e arquivo grande demais', async () => {
    const { fn, calls } = fakeFetch(() => new Response('x'));
    expect(await api(fn).download('https://evil.example/x.pdf', 1000)).toMatchObject({
      error: 'host_not_allowed',
    });
    expect(await api(fn).download('http://pncp.gov.br/x', 1000)).toMatchObject({
      error: 'host_not_allowed',
    });
    expect(calls).toHaveLength(0);
    const big = fakeFetch(
      () => new Response(new Uint8Array(5000), { headers: { 'content-length': '5000' } }),
    ).fn;
    expect(await api(big).download('https://pncp.gov.br/a', 1000)).toMatchObject({
      error: 'too_large',
    });
  });

  it('download devolve bytes e nome do arquivo', async () => {
    const fn = fakeFetch(
      () =>
        new Response(new Uint8Array([37, 80, 68, 70]), {
          headers: { 'content-disposition': 'attachment; filename="edital.pdf"' },
        }),
    ).fn;
    const r = await api(fn).download('https://pncp.gov.br/a', 1000);
    expect(r.ok && r.data.filename).toBe('edital.pdf');
  });
});
