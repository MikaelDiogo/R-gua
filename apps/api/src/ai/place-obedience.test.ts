import { AiSearchRequest, SearchIntent } from '@agora/contracts';
import type { Db } from '@agora/db';
import { describe, expect, it } from 'vitest';
import type { SummaryRow } from '../platform/serialize';
import { SearchService } from '../search/search.service';
import { AiSearchService } from './ai-search.service';
import type { HelpService } from './help.service';

/**
 * Regra de aceite do dono: numa pergunta como "Licitações em Crateús" NUNCA aparece edital de outra cidade, em
 * nenhum campo da resposta. O banco falso abaixo só filtra por município se o SQL pedir o filtro: se o servidor
 * esquecer `p.municipality_ibge = ANY(...)` em qualquer consulta, ele devolve as três cidades e o teste falha.
 */
const NOW = new Date('2026-11-23T12:00:00Z');
const clock = () => NOW;

interface Row extends SummaryRow {
  municipality_ibge: string;
}

let seq = 0;
const row = (city: string, ibge: string, object: string): Row => {
  seq += 1;
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  return {
    id,
    numero_controle_pncp: `${ibge}-1-${seq}/2026`,
    object_text: object,
    organ_cnpj: `0000000000${String(seq).padStart(4, '0')}`,
    organ_name: `Prefeitura Municipal de ${city}`,
    uf: 'CE',
    municipality_name: city,
    modality: 6,
    modality_name: 'Pregão - Eletrônico',
    status: 'open_for_proposals',
    estimated_value: null,
    published_at: new Date('2026-11-01T12:00:00Z'),
    proposals_open_at: new Date('2026-11-02T12:00:00Z'),
    proposals_close_at: new Date(`2026-12-${String(seq).padStart(2, '0')}T12:00:00Z`),
    quality_flags: [],
    source_url: null,
    origin_url: null,
    municipality_ibge: ibge,
  };
};

const DATA: Row[] = [
  row('Crateús', '2304103', 'Aquisição de material de limpeza e higienização'),
  row('Crateús', '2304103', 'Contratação de assessoria jurídica e adequação à LGPD'),
  row('Crateús', '2304103', 'Serviços de engenharia para drenagem urbana'),
  row('Fortaleza', '2304400', 'Aquisição de material de limpeza para escolas'),
  row('Fortaleza', '2304400', 'Assessoria jurídica em proteção de dados (LGPD) para a secretaria'),
  row('Limoeiro do Norte', '2307601', 'Aquisição de material de limpeza e conservação'),
  row('Limoeiro do Norte', '2307601', 'Consultoria jurídica em LGPD e conformidade'),
];

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function fakeDb() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (
        /p\.id, p\.numero_controle_pncp/.test(sql) ||
        /SELECT count\(\*\) AS n\s+FROM procurements p/.test(sql)
      ) {
        let rows = [...DATA];
        // O banco falso só aplica o filtro que o SQL realmente contém.
        for (const m of sql.matchAll(/p\.municipality_ibge = ANY\(\$(\d+)\)/g)) {
          const want = params[Number(m[1]) - 1] as string[];
          rows = rows.filter((r) => want.includes(r.municipality_ibge));
        }
        const uf = [...sql.matchAll(/p\.uf = ANY\(\$(\d+)\)/g)];
        for (const m of uf) {
          const want = params[Number(m[1]) - 1] as string[];
          rows = rows.filter((r) => want.includes(r.uf ?? ''));
        }
        if (/websearch_to_tsquery/.test(sql)) {
          const terms = String(params[0])
            .split(/\s+or\s+/i)
            .map((t) => fold(t.replace(/"/g, '').trim()))
            .filter(Boolean);
          rows = rows.filter((r) => terms.some((t) => fold(r.object_text).includes(t)));
        }
        if (/count\(\*\) AS n/.test(sql))
          return { rows: [{ n: String(rows.length) }], rowCount: 1 };
        const limit = Number(params[params.length - 2]);
        return { rows: rows.slice(0, limit), rowCount: rows.length };
      }
      if (/max\(updated_at\)/.test(sql)) return { rows: [{ at: null }], rowCount: 1 };
      if (/WHERE municipality_ibge = ANY\(\$1\)/.test(sql)) {
        const want = params[0] as string[];
        return {
          rows: [{ n: String(DATA.filter((r) => want.includes(r.municipality_ibge)).length) }],
          rowCount: 1,
        };
      }
      if (/count\(\*\) AS n FROM procurements$/.test(sql.trim())) {
        return { rows: [{ n: String(DATA.length) }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  return { db: db as unknown as Db, calls };
}

/** IA falsa: entende conforme o roteiro (inclusive de forma "rebelde": põe a cidade nas palavras-chave e chuta outra UF). */
function fakeLlm(script: { keywords: string[]; uf?: string[] }) {
  const state = { understandCalls: 0, evaluateCalls: 0 };
  return {
    state,
    llm: {
      modelName: 'fake',
      generateObject: async (args: { system: string; user: string }) => {
        if (args.system.includes('Converta o pedido')) {
          state.understandCalls += 1;
          return {
            value: {
              summary: 'entendido',
              keywords: script.keywords,
              criteria: ['Objeto serve ao pedido'],
              filters: script.uf ? { uf: script.uf } : {},
            },
            model: 'fake',
            tokensIn: 1,
            tokensOut: 1,
          };
        }
        state.evaluateCalls += 1;
        const ids = [...args.user.matchAll(/<edital id="([^"]+)">/g)].map((m) => m[1] as string);
        return {
          value: {
            conclusion: 'ok',
            best_id: ids[0] ?? '',
            ranked: ids.map((id) => ({
              id,
              criteria: [{ name: 'Objeto serve ao pedido', status: 'meets' }],
              reasons: [],
              concerns: [],
              evidence: [],
              object_fit: 'exact',
            })),
          },
          model: 'fake',
          tokensIn: 1,
          tokensOut: 1,
        };
      },
    },
  };
}

const web = { configured: false, search: async () => null, extract: async () => null };
const noHelp = { tryAnswer: async () => null } as unknown as HelpService;

type Refresh = NonNullable<AiSearchService['refreshLive']>;

/** Consulta ao vivo falsa: registra os municípios pedidos (o PNCP real nunca é chamado nos testes). */
function fakeRefresh(result: Awaited<ReturnType<Refresh>> | Error) {
  const asked: string[] = [];
  const fn: Refresh = async (_db, ibge) => {
    asked.push(ibge);
    if (result instanceof Error) throw result;
    return result;
  };
  return { fn, asked };
}

function make(
  script: { keywords: string[]; uf?: string[] },
  help: HelpService = noHelp,
  refresh: Refresh | undefined = async () => ({ fetched: 0, upserted: 0, complete: true }),
) {
  const { db, calls } = fakeDb();
  const { llm, state } = fakeLlm(script);
  const svc = new AiSearchService(
    new SearchService(db, clock),
    llm as never,
    web as never,
    db,
    clock,
    help,
  );
  svc.refreshLive = refresh;
  return { svc, calls, state };
}

const ask = (prompt: string, extra: Record<string, unknown> = {}) =>
  AiSearchRequest.parse({ prompt, sources: { pncp: true, web: false }, ...extra });

const OTHER_CITIES = /Fortaleza|Limoeiro/;

describe('"Licitações em Crateús": nunca aparece edital de outra cidade', () => {
  it('só Crateús em results, watchlist e qualquer campo; sem gastar IA; filtro no SQL de toda consulta', async () => {
    const { svc, calls, state } = make({ keywords: [] });
    const r = await svc.run(ask('Licitações em Crateús'));
    expect(r.kind).toBe('search');
    expect(r.results).toHaveLength(3);
    expect(r.results.every((x) => x.procurement.organ.municipality === 'Crateús')).toBe(true);
    expect(
      r.watchlist.flatMap((w) => w.items).every((i) => i.organ.municipality === 'Crateús'),
    ).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(OTHER_CITIES);
    expect(r.understood.municipality).toEqual([{ name: 'Crateús', ibge: '2304103', uf: 'CE' }]);
    expect(r.understood.filters).toContain('Município: Crateús (CE)');
    expect(state.understandCalls + state.evaluateCalls).toBe(0); // pedido só de lugar: sem IA
    const procurementQueries = calls.filter((c) => /FROM procurements p/.test(c.sql));
    expect(procurementQueries.length).toBeGreaterThanOrEqual(3); // lista, total e vigilância
    for (const c of procurementQueries) {
      expect(c.sql).toContain('p.municipality_ibge = ANY(');
      expect(c.params.some((p) => Array.isArray(p) && p.includes('2304103'))).toBe(true);
      expect(c.params.some((p) => Array.isArray(p) && p.includes('2304400'))).toBe(false);
    }
  });

  it('com a vigilância de LGPD: só aparece o que é de Crateús (Fortaleza e Limoeiro, mesmo com LGPD, ficam de fora)', async () => {
    const { svc } = make({ keywords: [] });
    const r = await svc.run(ask('Licitações em Crateús abertas', { scope: 'open' }));
    const all = [...r.results.map((x) => x.procurement), ...r.watchlist.flatMap((w) => w.items)];
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((i) => i.organ.municipality === 'Crateús')).toBe(true);
  });

  it('dois lugares: "Crateús e Sobral" aplica os dois (IN), nunca "o mais parecido"', async () => {
    const { svc, calls } = make({ keywords: [] });
    const r = await svc.run(ask('Licitações em Crateús e Sobral'));
    expect(r.understood.municipality.map((m) => m.name)).toEqual(['Crateús', 'Sobral']);
    expect(r.results.every((x) => x.procurement.organ.municipality === 'Crateús')).toBe(true); // Sobral não tem edital na base
    expect(JSON.stringify(r)).not.toMatch(OTHER_CITIES);
    const list = calls.find((c) => /p\.id, p\.numero_controle_pncp/.test(c.sql));
    expect(
      list?.params.some((p) => Array.isArray(p) && p.includes('2304103') && p.includes('2312908')),
    ).toBe(true);
  });

  it('cidade sem edital: resposta vazia e honesta, nunca preenchida com outra cidade', async () => {
    const { svc } = make({ keywords: [] });
    const r = await svc.run(ask('Licitações em Tianguá'));
    expect(r.results).toEqual([]);
    expect(r.conclusion).toContain('Tianguá');
    expect(r.conclusion).toContain('Nada foi trocado por outra cidade');
    expect(r.conclusion).toContain('pncp.gov.br/app/editais?q=Tiangu');
    expect(JSON.stringify(r)).not.toMatch(/Crateús|Fortaleza|Limoeiro/);
  });

  it('com objeto: IA "rebelde" (cidade nas palavras-chave e outra UF) não muda o lugar nem traz outra cidade', async () => {
    const { svc, state } = make({ keywords: ['material de limpeza', 'crateús'], uf: ['PI'] });
    const r = await svc.run(ask('material de limpeza em Crateús'));
    expect(state.understandCalls).toBe(1);
    expect(r.understood.keywords).toEqual(['material de limpeza']);
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results.every((x) => x.procurement.organ.municipality === 'Crateús')).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(OTHER_CITIES);
    expect(r.understood.filters.some((f) => f.startsWith('UF:'))).toBe(false);
  });

  it('nada casa com o objeto pedido: vazio, sem relaxar filtro nem trazer "o mais próximo"', async () => {
    const { svc } = make({ keywords: ['helicóptero'] });
    const r = await svc.run(ask('helicóptero em Crateús'));
    expect(r.results).toEqual([]);
    expect(r.meta.degraded).not.toContain('filters_relaxed');
    expect(JSON.stringify(r)).not.toMatch(OTHER_CITIES);
    expect(r.conclusion).toContain('Crateús');
  });

  it('lugar fora de CE/PI: diz que a cobertura é só CE e PI, sem buscar outra coisa', async () => {
    const { svc, calls } = make({ keywords: [] });
    const r = await svc.run(ask('Licitações em São Paulo'));
    expect(r.results).toEqual([]);
    expect(r.conclusion).toContain('Ceará e o Piauí');
    expect(calls.filter((c) => /FROM procurements p/.test(c.sql))).toHaveLength(0);
  });
});

describe('consulta ao vivo ao PNCP para o município pedido', () => {
  it('chama a consulta para Crateús (2304103) e informa o que trouxe (PNCP tem 6; a base tinha 5)', async () => {
    const live = fakeRefresh({ fetched: 6, upserted: 1, complete: true });
    const { svc } = make({ keywords: [] }, noHelp, live.fn);
    const r = await svc.run(ask('Licitações em Crateús'));
    expect(live.asked).toEqual(['2304103']);
    expect(r.understood.live_refresh).toEqual({ fetched: 6, upserted: 1, complete: true });
    expect(r.meta.degraded).not.toContain('live_refresh_failed');
  });

  it('falha da consulta ao vivo nunca derruba a busca: só marca degradado e segue com a base', async () => {
    const live = fakeRefresh(new Error('PNCP fora do ar'));
    const { svc } = make({ keywords: [] }, noHelp, live.fn);
    const r = await svc.run(ask('Licitações em Crateús'));
    expect(r.results).toHaveLength(3);
    expect(r.meta.degraded).toContain('live_refresh_failed');
    expect(r.understood.live_refresh).toBeNull();
  });

  it('sem município no pedido, não consulta o PNCP ao vivo', async () => {
    const live = fakeRefresh({ fetched: 0, upserted: 0, complete: true });
    const { svc } = make({ keywords: ['material de limpeza'] }, noHelp, live.fn);
    await svc.run(ask('material de limpeza'));
    expect(live.asked).toEqual([]);
  });
});

describe('chat de ajuda com as fontes desligadas', () => {
  const help = {
    tryAnswer: async (p: string) =>
      /como guardo/i.test(p)
        ? { answer: 'Clique em Vou disputar.', suggestions: ['Como uso o Funil?'] }
        : null,
  } as unknown as HelpService;
  const off = { pncp: false, web: false };

  it('pergunta de ajuda responde (kind help) mesmo com PNCP e Web desligados', async () => {
    const { svc } = make({ keywords: [] }, help);
    const r = await svc.run(
      AiSearchRequest.parse({ prompt: 'como guardo um edital no funil?', sources: off }),
    );
    expect(r.kind).toBe('help');
    expect(r.help?.answer).toContain('Vou disputar');
    expect(r.results).toEqual([]);
  });

  it('a mesma configuração com uma BUSCA continua recusada (422)', async () => {
    const { svc } = make({ keywords: [] }, help);
    await expect(
      svc.run(AiSearchRequest.parse({ prompt: 'licitações em Crateús', sources: off })),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });
});

describe('Buscador: o lugar digitado vira filtro, não texto', () => {
  it('"licitação em Crateús" aplica o município 2304103 e não exige palavra nenhuma no objeto', async () => {
    const { db, calls } = fakeDb();
    const svc = new SearchService(db, clock);
    const r = await svc.search(SearchIntent.parse({ q: 'licitação em Crateús' }));
    expect(r.meta.applied?.municipalities).toEqual([
      { name: 'Crateús', ibge: '2304103', uf: 'CE' },
    ]);
    expect(r.meta.applied?.text).toBeNull();
    expect(r.items.every((i) => i.organ.municipality === 'Crateús')).toBe(true);
    expect(calls.some((c) => c.sql.includes('websearch_to_tsquery'))).toBe(false);
  });

  it('Crato e Crateús são cidades diferentes: cada uma aplica o seu código; "Crato e Crateús" aplica os dois', async () => {
    const run = async (q: string) => {
      const { db } = fakeDb();
      const r = await new SearchService(db, clock).search(SearchIntent.parse({ q }));
      return r.meta.applied?.municipalities.map((m) => m.ibge);
    };
    expect(await run('licitação em Crato')).toEqual(['2304202']);
    expect(await run('licitação em Crateús')).toEqual(['2304103']);
    expect((await run('licitação em Crato e Crateús'))?.sort()).toEqual(['2304103', '2304202']);
  });

  it('mantém o texto que sobra: "notebooks em Crateús" filtra a cidade e busca "notebooks"', async () => {
    const { db } = fakeDb();
    const r = await new SearchService(db, clock).search(
      SearchIntent.parse({ q: 'notebooks em Crateús' }),
    );
    expect(r.meta.applied?.text).toBe('notebooks');
  });
});
