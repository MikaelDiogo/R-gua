import { describe, expect, it } from 'vitest';
import { fakeDb } from './fake-db.test-util';
import { runOpen, runRecent } from './jobs';
import { EP_PROPOSTA, EP_PUBLICACAO } from './pncp/connector';
import { fakeFetch, json, testClient } from './pncp/helpers.test-util';
import { servePaged } from './pncp/serve.test-util';

const NOW = new Date('2026-11-23T15:00:00Z');
const now = () => NOW;

/** O volume depende da UF: CE tem 650 abertas (13 páginas, mais que o corte antigo de 8); PI está vazio. */
function byUf(totals: Record<string, number>) {
  const cache = new Map<string, ReturnType<typeof servePaged>>();
  const calls: URL[] = [];
  const fn = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const uf = url.searchParams.get('uf') ?? '';
    let s = cache.get(uf);
    if (!s) {
      s = servePaged(totals[uf] ?? 0, uf || 'X');
      cache.set(uf, s);
    }
    calls.push(url);
    return s.fn(url.toString());
  }) as typeof fetch;
  return { fn, calls };
}

describe('runOpen (carga de propostas abertas sem corte)', () => {
  it('traz TODAS as páginas (13 > corte antigo de 8), numa consulta por UF, sem filtro de modalidade', async () => {
    const { fn, calls } = byUf({ CE: 650 });
    const { client } = testClient(fn);
    const f = fakeDb();
    const sum = await runOpen(f.db, { ufs: ['CE', 'PI'], client, now });
    expect(sum).toMatchObject({ windows: 2, fetched: 650, inserted: 650, partial: 0, failed: 0 });
    expect(f.known.size).toBe(650);
    const ce = calls.filter((u) => u.searchParams.get('uf') === 'CE');
    expect(ce).toHaveLength(13);
    expect(ce.every((u) => !u.searchParams.has('codigoModalidadeContratacao'))).toBe(true);
    expect(ce.every((u) => u.pathname.endsWith(EP_PROPOSTA))).toBe(true);
    // A janela fica 'ok' (modalidade 0 = todas): nada de "parcial".
    expect([...f.windows.values()].map((w) => w.state)).toEqual(['ok', 'ok']);
  });

  it('com o corte antigo (8 páginas) a carga é marcada INCOMPLETA, nunca "ok"', async () => {
    const { fn } = byUf({ CE: 650 });
    const { client } = testClient(fn);
    const f = fakeDb();
    const sum = await runOpen(f.db, { ufs: ['CE'], pages: 8, client, now });
    expect(sum.partial).toBe(1);
    expect(sum.fetched).toBe(400);
    expect([...f.windows.values()][0]?.state).toBe('partial');
  });

  it('com --modalities consulta cada modalidade separada', async () => {
    const { fn, calls } = byUf({ CE: 20 });
    const { client } = testClient(fn);
    await runOpen(fakeDb().db, { ufs: ['CE'], modalities: [6, 8], client, now });
    expect(calls.map((u) => u.searchParams.get('codigoModalidadeContratacao'))).toEqual(['6', '8']);
  });

  it('falha do PNCP vira janela failed e erro no resumo, nunca "vazio"', async () => {
    const { fn } = fakeFetch(() => new Response('erro', { status: 500 }));
    const { client } = testClient(fn);
    const f = fakeDb();
    const sum = await runOpen(f.db, { ufs: ['CE'], client, now });
    expect(sum.failed).toBe(1);
    expect([...f.windows.values()][0]?.state).toBe('failed');
  });
});

describe('runRecent (publicadas nos últimos N dias, qualquer situação)', () => {
  it('usa o endpoint de publicação, uma modalidade por chamada, por semana e UF', async () => {
    const { fn, calls } = fakeFetch(() => new Response(null, { status: 204 }));
    const { client } = testClient(fn);
    const f = fakeDb();
    const sum = await runRecent(f.db, {
      days: 14,
      ufs: ['CE', 'PI'],
      modalities: [6, 8],
      client,
      now,
    });
    expect(sum.windows).toBe(2 * 2 * 2); // 2 semanas × 2 UF × 2 modalidades
    expect(calls).toHaveLength(8);
    expect(calls.every((u) => u.pathname.endsWith(EP_PUBLICACAO))).toBe(true);
    expect(calls[0]?.searchParams.get('dataInicial')).toBe('20261117');
    expect(calls[0]?.searchParams.get('dataFinal')).toBe('20261123');
  });

  it('grava registros de qualquer situação e não guarda o corpo bruto', async () => {
    const { fn } = servePaged(30, 'R');
    const { client } = testClient(fn);
    const f = fakeDb();
    const sum = await runRecent(f.db, { days: 7, ufs: ['CE'], modalities: [6], client, now });
    expect(sum.inserted).toBe(30);
    expect(f.log.some((q) => q.includes('INSERT INTO ingest_raw'))).toBe(false);
  });

  it('retoma: pula janela ok recente, refaz a antiga e a que contém hoje', async () => {
    const { fn, calls } = fakeFetch(() => new Response(null, { status: 204 }));
    const { client } = testClient(fn);
    const f = fakeDb();
    const ep = `${EP_PUBLICACAO}?uf=CE`;
    f.seedWindow(ep, 6, '20261117', '20261123', 'ok', 1); // contém hoje: refaz mesmo recente
    f.seedWindow(ep, 6, '20261110', '20261116', 'ok', 2); // recente: pula
    f.seedWindow(ep, 6, '20261103', '20261109', 'ok', 30); // velha: refaz
    const sum = await runRecent(f.db, { days: 21, ufs: ['CE'], modalities: [6], client, now });
    expect(sum.skipped).toBe(1);
    expect(calls).toHaveLength(2);
    expect(calls.map((u) => u.searchParams.get('dataInicial'))).toEqual(['20261117', '20261103']);
  });

  it('janela que ficou parcial é refeita na próxima rodada', async () => {
    const { fn, calls } = fakeFetch(() =>
      json({ data: [], totalRegistros: 0, totalPaginas: 0, numeroPagina: 1 }),
    );
    const { client } = testClient(fn);
    const f = fakeDb();
    f.seedWindow(`${EP_PUBLICACAO}?uf=CE`, 6, '20261110', '20261116', 'partial', 1);
    const sum = await runRecent(f.db, { days: 14, ufs: ['CE'], modalities: [6], client, now });
    expect(sum.skipped).toBe(0);
    expect(calls).toHaveLength(2);
  });
});
