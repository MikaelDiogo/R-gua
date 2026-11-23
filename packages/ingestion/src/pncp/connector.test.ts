import { describe, expect, it } from 'vitest';
import { EP_PROPOSTA, EP_PUBLICACAO, PncpConnector } from './connector';
import { detectIgnoredFilter } from './filter-detector';
import { fakeFetch, fixture, json, testClient } from './helpers.test-util';

const NOW = new Date('2026-11-03T13:00:00Z');
const base = () => fixture('publicacao-pregao-eletronico.json');

/** Serve `total` registros em páginas de 10, reaproveitando os registros reais da fixture. */
function paged(total: number, failOnPage?: { page: number; res: () => Response }) {
  const rec = base().data as any[];
  return fakeFetch((url) => {
    const pagina = Number(url.searchParams.get('pagina'));
    if (failOnPage && pagina === failOnPage.page) return failOnPage.res();
    const from = (pagina - 1) * 10;
    const n = Math.min(10, total - from);
    const data = Array.from({ length: n }, (_, i) => {
      const r = structuredClone(rec[(from + i) % rec.length]);
      r.numeroControlePNCP = `${String(from + i).padStart(14, '0')}-1-000001/2026`;
      return r;
    });
    return json({
      data,
      totalRegistros: total,
      totalPaginas: Math.ceil(total / 10),
      numeroPagina: pagina,
      paginasRestantes: 0,
      empty: false,
    });
  });
}

describe('PncpConnector.fetch', () => {
  it('percorre todas as páginas e normaliza', async () => {
    const { fn, calls } = paged(25);
    const { client } = testClient(fn);
    const c = new PncpConnector({ client, pageSize: 10, now: () => NOW });
    const r = await c.fetch({
      source: 'pncp',
      endpoint: EP_PUBLICACAO,
      modality: 6,
      start: '20261101',
      end: '20261102',
    });
    expect(r).toMatchObject({
      status: 'ok',
      complete: true,
      pagesFetched: 3,
      totalRecords: 25,
      totalPages: 3,
    });
    expect(r.items).toHaveLength(25);
    expect(new Set(r.items.map((i) => i.numeroControlePncp)).size).toBe(25);
    expect(r.raw).toHaveLength(3);
    expect(calls[0]?.searchParams.get('codigoModalidadeContratacao')).toBe('6');
    expect(calls[0]?.searchParams.get('tamanhoPagina')).toBe('10');
  });

  it('janela sem registros (204) → empty e completa', async () => {
    const { fn } = fakeFetch(() => new Response(null, { status: 204 }));
    const { client } = testClient(fn);
    const r = await new PncpConnector({ client }).fetch({
      source: 'pncp',
      endpoint: EP_PUBLICACAO,
      modality: 13,
      start: '20261101',
      end: '20261101',
    });
    expect(r).toMatchObject({ status: 'empty', complete: true, items: [] });
  });

  it('falha na página 2 mantém o que já veio e marca a janela como incompleta (rate_limited ≠ vazio)', async () => {
    const { fn } = paged(25, { page: 2, res: () => new Response('<html/>', { status: 429 }) });
    const { client } = testClient(fn, { maxRetries: 0 });
    const r = await new PncpConnector({ client, pageSize: 10, now: () => NOW }).fetch({
      source: 'pncp',
      endpoint: EP_PUBLICACAO,
      modality: 6,
      start: '20261101',
      end: '20261102',
    });
    expect(r.status).toBe('rate_limited');
    expect(r.complete).toBe(false);
    expect(r.items).toHaveLength(10);
  });

  it('registro fora do schema → schema_mismatch, preservando os válidos', async () => {
    const page = base();
    const ruim = { ...page.data[0] };
    ruim.orgaoEntidade = null;
    page.data = [ruim, ...page.data.slice(1, 5)];
    page.totalRegistros = 5;
    page.totalPaginas = 1;
    const { fn } = fakeFetch(() => json(page));
    const { client } = testClient(fn);
    const r = await new PncpConnector({ client, now: () => NOW }).fetch({
      source: 'pncp',
      endpoint: EP_PUBLICACAO,
      modality: 6,
      start: '20261101',
      end: '20261102',
    });
    expect(r.status).toBe('schema_mismatch');
    expect(r.complete).toBe(false);
    expect(r.items).toHaveLength(4);
    expect(r.error).toContain('1 registro');
  });

  it('propostas abertas aceitam janela sem modalidade (comportamento real do Swagger)', async () => {
    const { fn, calls } = fakeFetch(() =>
      json({ ...fixture('proposta-sem-modalidade.json'), totalPaginas: 1 }),
    );
    const { client } = testClient(fn);
    const c = new PncpConnector({ client, now: () => NOW });
    const r = await c.fetch(c.openProposalsWindow(NOW));
    expect(r.status).toBe('ok');
    expect(calls[0]?.pathname).toContain('/v1/contratacoes/proposta');
    expect(calls[0]?.searchParams.has('codigoModalidadeContratacao')).toBe(false);
    expect(calls[0]?.searchParams.get('dataFinal')).toBe('20261103');
    expect(r.items.some((i) => i.isOpen)).toBe(true);
    expect(EP_PROPOSTA).toBe('/v1/contratacoes/proposta');
  });

  it('publicação sem modalidade é erro de programação, não chamada à API', async () => {
    const { fn, calls } = fakeFetch(() => json(base()));
    const { client } = testClient(fn);
    await expect(
      new PncpConnector({ client }).fetch({
        source: 'pncp',
        endpoint: EP_PUBLICACAO,
        start: '20261101',
        end: '20261101',
      }),
    ).rejects.toThrow(/modalidade/);
    expect(calls).toHaveLength(0);
  });
});

describe('PncpConnector.listWindows e matchKeys', () => {
  it('gera 13 modalidades por janela, do mais recente ao mais antigo', async () => {
    const c = new PncpConnector({ now: () => NOW });
    const ws = [];
    for await (const w of c.listWindows(new Date('2026-11-01T15:00:00Z'), NOW)) ws.push(w);
    expect(ws).toHaveLength(13 * 3); // 3, 2 e 1 de novembro
    expect(ws[0]).toMatchObject({ end: '20261103', modality: 1 });
    expect(ws.at(-1)).toMatchObject({ end: '20261101', modality: 13 });
    expect(new Set(ws.map((w) => w.modality)).size).toBe(13);
  });

  it('janelas de vários dias respeitam o início', async () => {
    const c = new PncpConnector({ windowDays: 7, now: () => NOW });
    const ws = [];
    for await (const w of c.listWindows(new Date('2026-10-30T15:00:00Z'), NOW)) ws.push(w);
    expect(ws.every((w) => w.start >= '20261030')).toBe(true);
    expect(ws[0]).toMatchObject({ start: '20261030', end: '20261103' });
  });

  it('chaves de deduplicação: número de controle e órgão+processo+modalidade+ano', () => {
    const c = new PncpConnector({ now: () => NOW });
    const [n] = c.normalize(base());
    const keys = c.matchKeys(n!);
    expect(keys[0]).toBe(`pncp:${n!.numeroControlePncp}`);
    expect(keys[1]).toMatch(/^proc:\d{14}\|.+\|\d+\|\d{4}$/);
  });
});

describe('detector de filtro ignorado', () => {
  const win = { start: '20261101', end: '20261102', modality: 6 };

  it('mesmo total com a palavra improvável → ignored (comportamento conhecido em 2026-11-03)', async () => {
    const { fn } = fakeFetch(() => json(base()));
    const { client } = testClient(fn);
    const r = await detectIgnoredFilter(client, win);
    expect(r).toMatchObject({ verdict: 'ignored', baselineTotal: 31, filteredTotal: 31 });
  });

  it('palavra que zera o resultado → respected', async () => {
    const { fn } = fakeFetch((u) =>
      u.searchParams.has('palavraChave') ? new Response(null, { status: 204 }) : json(base()),
    );
    const { client } = testClient(fn);
    expect(await detectIgnoredFilter(client, win)).toMatchObject({
      verdict: 'respected',
      filteredTotal: 0,
    });
  });

  it('429 nunca vira veredito', async () => {
    const { fn } = fakeFetch(() => new Response('x', { status: 429 }));
    const { client } = testClient(fn, { maxRetries: 0 });
    expect((await detectIgnoredFilter(client, win)).verdict).toBe('inconclusive');
  });
});
