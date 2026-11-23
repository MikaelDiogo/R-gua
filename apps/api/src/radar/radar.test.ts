import type { Db } from '@agora/db';
import { describe, expect, it } from 'vitest';
import type { SummaryRow } from '../platform/serialize';
import { SearchService } from '../search/search.service';
import { buildInterests, type ChatRow, chatInterests, type MonitorRow } from './interests';
import { RadarService } from './radar.service';

/**
 * Regras do "Para você": só o que está ABERTO, só dados da própria conta e o lugar de cada interesse como filtro
 * estrito. O banco falso só filtra por município/UF se o SQL realmente pedir; se o servidor esquecer o filtro, ele
 * devolve as três cidades e os testes de lugar falham.
 */
const NOW = new Date('2026-11-23T12:00:00Z');
const clock = () => NOW;

interface Row extends SummaryRow {
  municipality_ibge: string;
}

let seq = 0;
const row = (city: string, ibge: string, object: string): Row => {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
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
    proposals_close_at: new Date(`2026-12-${String((seq % 27) + 1).padStart(2, '0')}T12:00:00Z`),
    quality_flags: [],
    source_url: null,
    origin_url: null,
    municipality_ibge: ibge,
  };
};

const CRATEUS = '2304103';
const FORTALEZA = '2304400';
const LIMOEIRO = '2307601';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface DbUser {
  chat?: Array<Partial<ChatRow> & Pick<ChatRow, 'conversation_id' | 'role' | 'created_at'>>;
  monitors?: MonitorRow[];
}

function fakeDb(data: Row[], users: Record<string, DbUser>, opts: { failOn?: string } = {}) {
  const searches: Array<{ sql: string; params: unknown[] }> = [];
  const searchQuery = async (sql: string, params: unknown[] = []) => {
    if (
      /p\.id, p\.numero_controle_pncp/.test(sql) ||
      /SELECT count\(\*\) AS n\s+FROM procurements p/.test(sql)
    ) {
      searches.push({ sql, params });
      if (opts.failOn && String(params[0]).includes(opts.failOn)) throw new Error('falha simulada');
      let rows = [...data];
      for (const m of sql.matchAll(/p\.municipality_ibge = ANY\(\$(\d+)\)/g)) {
        const want = params[Number(m[1]) - 1] as string[];
        rows = rows.filter((r) => want.includes(r.municipality_ibge));
      }
      for (const m of sql.matchAll(/p\.uf = ANY\(\$(\d+)\)/g)) {
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
      if (/count\(\*\) AS n/.test(sql)) return { rows: [{ n: String(rows.length) }], rowCount: 1 };
      const limit = Number(params[params.length - 2]);
      return { rows: rows.slice(0, limit), rowCount: rows.length };
    }
    if (/max\(updated_at\)/.test(sql)) return { rows: [{ at: null }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const connect = async () => {
    const state = { user: '' };
    return {
      release() {},
      query: async (sql: string, params: unknown[] = []) => {
        if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [], rowCount: 0 };
        if (/set_config/.test(sql)) {
          state.user = String(params[0]);
          return { rows: [], rowCount: 1 };
        }
        // O banco de verdade entrega só as linhas de quem está em app.user_id (RLS): o falso faz o mesmo.
        if (/FROM conversation_messages/.test(sql)) {
          const rows = (users[state.user]?.chat ?? []).map((r) => ({
            prompt: null,
            kind: null,
            keywords: null,
            municipality: null,
            ...r,
          }));
          return { rows, rowCount: rows.length };
        }
        if (/FROM monitors/.test(sql)) {
          const rows = users[state.user]?.monitors ?? [];
          return { rows, rowCount: rows.length };
        }
        throw new Error(`consulta não prevista: ${sql.slice(0, 60)}`);
      },
    };
  };
  const db = { query: searchQuery, connect } as unknown as Db;
  return { db, searches };
}

const radar = (db: Db) => new RadarService(db, clock, new SearchService(db, clock));
const at = (min: number) => new Date(NOW.getTime() - min * 60_000);

/** Pergunta + resposta salvas, como o chat grava (a resposta só traz o que o Radar lê). */
function turn(
  conv: string,
  min: number,
  prompt: string,
  saved: {
    keywords?: string[];
    municipality?: Array<{ name: string; ibge: string; uf: string }>;
    kind?: string;
  },
): NonNullable<DbUser['chat']> {
  return [
    { conversation_id: conv, role: 'user', prompt, created_at: at(min) },
    {
      conversation_id: conv,
      role: 'assistant',
      kind: saved.kind ?? 'search',
      keywords: saved.keywords ?? [],
      municipality: saved.municipality ?? [],
      created_at: at(min - 1),
    },
  ];
}

const monitorRow = (
  name: string,
  q: string | undefined,
  min: number,
  filters = {},
): MonitorRow => ({
  name,
  intent: { q, filters, sort: 'published_desc' },
  updated_at: at(min),
});

const CRATEUS_ONLY = { name: 'Crateús', ibge: CRATEUS, uf: 'CE' };

const DATA: Row[] = [
  row('Crateús', CRATEUS, 'Aquisição de material de limpeza e higienização'),
  row('Crateús', CRATEUS, 'Contratação de assessoria jurídica e adequação à LGPD'),
  row('Crateús', CRATEUS, 'Aquisição de notebooks para a secretaria de educação'),
  row('Fortaleza', FORTALEZA, 'Aquisição de material de limpeza para escolas'),
  row('Fortaleza', FORTALEZA, 'Aquisição de notebooks para a rede municipal'),
  row('Limoeiro do Norte', LIMOEIRO, 'Aquisição de material de limpeza e conservação'),
];

describe('interesses (puro)', () => {
  it('pareia cada pergunta com a resposta seguinte e ignora dúvida sobre o sistema', () => {
    const rows = [
      ...turn('c1', 30, 'licitações em Crateús', { municipality: [CRATEUS_ONLY] }),
      ...turn('c1', 20, 'como guardo um edital no funil?', { kind: 'help' }),
      ...turn('c2', 10, 'notebooks para escola', { keywords: ['notebook', 'computador portátil'] }),
    ] as ChatRow[];
    const out = chatInterests(rows);
    expect(out.map((i) => i.label)).toEqual([
      'licitações em Crateús',
      'notebook, computador portátil',
    ]);
    expect(out[0]?.filters.municipality_ibge).toEqual([CRATEUS]);
    expect(out[0]?.q).toBeUndefined(); // só o lugar: nada exigido no texto
    expect(out[1]?.filters.municipality_ibge).toBeUndefined(); // o lugar do outro interesse não vaza
    expect(out[1]?.q).toBe('notebook or "computador portátil"');
  });

  it('o município sai do pedido (sem IA) e nunca entra como texto; cidade de fora de CE/PI é descartada', () => {
    const rows = [
      ...turn('c1', 30, 'material de limpeza em Crateús', { keywords: ['material de limpeza'] }),
      ...turn('c2', 20, 'licitações em São Paulo', { keywords: [] }),
    ] as ChatRow[];
    const out = chatInterests(rows);
    expect(out).toHaveLength(1);
    expect(out[0]?.q).toBe('"material de limpeza"');
    expect(out[0]?.filters.municipality_ibge).toEqual([CRATEUS]);
    expect(out[0]?.label).toBe('material de limpeza em Crateús');
  });

  it('pergunta sem resposta gravada (busca cancelada) não vira interesse', () => {
    const rows = [
      { conversation_id: 'c1', role: 'user', prompt: 'notebooks', created_at: at(5) },
    ] as ChatRow[];
    expect(chatInterests(rows)).toEqual([]);
  });

  it('repetições viram um só, monitores ativos entram e o limite é 6', () => {
    const rows = [
      ...turn('c1', 60, 'notebooks', { keywords: ['notebook'] }),
      ...turn('c2', 50, 'notebooks de novo', { keywords: ['notebook'] }),
      ...turn('c3', 40, 'licitações em Crateús', { municipality: [CRATEUS_ONLY] }),
    ] as ChatRow[];
    const monitors = [monitorRow('Notebooks', 'notebook', 5)];
    const out = buildInterests(rows, monitors);
    expect(out.map((i) => i.source)).toEqual(['monitor', 'chat']); // "notebook" repetido: fica o mais recente
    const many = Array.from({ length: 9 }, (_, n) => monitorRow(`M${n}`, `assunto${n}`, n + 1));
    expect(buildInterests([], many)).toHaveLength(6);
  });
});

describe('GET /v1/radar/for-you (RadarService)', () => {
  it('"licitações em Crateús" + monitor "notebooks": cada interesse traz SÓ o lugar dele', async () => {
    const { db } = fakeDb(DATA, {
      u1: {
        chat: turn('c1', 30, 'licitações em Crateús', { municipality: [CRATEUS_ONLY] }),
        monitors: [monitorRow('Notebooks', 'notebook', 5)],
      },
    });
    const r = await radar(db).forYou('u1');
    expect(r.interests.map((i) => `${i.source}:${i.label}`)).toEqual([
      'monitor:Notebooks',
      'chat:licitações em Crateús',
    ]);
    expect(r.empty).toBeNull();
    const cityOf = (name: string) => r.items.find((x) => x.procurement.organ.municipality === name);
    // Tudo de Crateús (3) entra pelo chat; o de notebooks de Crateús casa com os dois interesses.
    const crateus = r.items.filter((x) => x.procurement.organ.municipality === 'Crateús');
    expect(crateus).toHaveLength(3);
    for (const x of crateus) expect(x.because.map((b) => b.source)).toContain('chat');
    const note = crateus.find((x) => x.procurement.object.includes('notebooks'));
    expect(note?.because).toHaveLength(2);
    // Fortaleza só aparece por notebooks (monitor, sem lugar): NUNCA por "Crateús".
    const fort = cityOf('Fortaleza');
    expect(fort?.procurement.object).toContain('notebooks');
    expect(fort?.because).toEqual([{ label: 'Notebooks', source: 'monitor' }]);
    // Limoeiro do Norte e o material de limpeza de Fortaleza não casam com nenhum interesse.
    expect(r.items.some((x) => x.procurement.organ.municipality === 'Limoeiro do Norte')).toBe(
      false,
    );
    expect(r.items.some((x) => x.procurement.object.includes('limpeza para escolas'))).toBe(false);
    // Quem casa com mais interesses vem primeiro.
    expect(r.items[0]?.because).toHaveLength(2);
  });

  it('o filtro de lugar vai no SQL da busca de cada interesse, e o de um não vaza para o outro', async () => {
    const { db, searches } = fakeDb(DATA, {
      u1: {
        chat: turn('c1', 30, 'licitações em Crateús', { municipality: [CRATEUS_ONLY] }),
        monitors: [monitorRow('Notebooks', 'notebook', 5)],
      },
    });
    await radar(db).forYou('u1');
    const lists = searches.filter((s) => /p\.id, p\.numero_controle_pncp/.test(s.sql));
    const withCity = lists.filter((s) => /p\.municipality_ibge = ANY/.test(s.sql));
    const withoutCity = lists.filter((s) => !/p\.municipality_ibge = ANY/.test(s.sql));
    expect(withCity).toHaveLength(1);
    expect(withoutCity).toHaveLength(1);
    expect(
      withCity[0]?.params.some((p) => Array.isArray(p) && p.length === 1 && p[0] === CRATEUS),
    ).toBe(true);
    // Sempre só o que está aberto e no futuro.
    for (const s of lists) expect(s.sql).toMatch(/p\.status = ANY|status/);
  });

  it('dúvida sobre o sistema não é interesse; só dúvidas e nada mais → no_interests', async () => {
    const { db } = fakeDb(DATA, {
      u1: { chat: turn('c1', 30, 'como guardo um edital no funil?', { kind: 'help' }) },
    });
    const r = await radar(db).forYou('u1');
    expect(r).toMatchObject({ interests: [], items: [], empty: 'no_interests' });
  });

  it('conta sem chat de busca e sem monitor → no_interests', async () => {
    const { db } = fakeDb(DATA, {});
    const r = await radar(db).forYou('ninguem');
    expect(r).toMatchObject({ interests: [], items: [], empty: 'no_interests' });
    expect(r.server_now).toBe(NOW.toISOString());
  });

  it('monitor pausado não conta (o SQL só lê os ativos)', async () => {
    let sqlSeen = '';
    const { db } = fakeDb(DATA, {});
    const orig = (
      db as unknown as {
        connect: () => Promise<{ query: (s: string, p?: unknown[]) => Promise<unknown> }>;
      }
    ).connect;
    (db as unknown as { connect: typeof orig }).connect = async () => {
      const c = await orig();
      const q = c.query.bind(c);
      c.query = async (sql: string, p?: unknown[]) => {
        if (/FROM monitors/.test(sql)) sqlSeen = sql;
        return q(sql, p);
      };
      return c;
    };
    await radar(db).forYou('u1');
    expect(sqlSeen).toMatch(/WHERE active/);
  });

  it('tem interesses mas nada aberto casa → no_matches (nunca preenche com outra cidade)', async () => {
    const { db } = fakeDb(DATA, {
      u1: {
        chat: turn('c1', 30, 'licitações em Sobral', {
          municipality: [{ name: 'Sobral', ibge: '2312908', uf: 'CE' }],
        }),
      },
    });
    const r = await radar(db).forYou('u1');
    expect(r.interests).toEqual([{ label: 'licitações em Sobral', source: 'chat' }]);
    expect(r).toMatchObject({ items: [], empty: 'no_matches' });
  });

  it('isolamento: o usuário B nunca vê interesses nem editais que vieram do chat do A', async () => {
    const { db } = fakeDb(DATA, {
      a: { chat: turn('ca', 30, 'licitações em Crateús', { municipality: [CRATEUS_ONLY] }) },
      b: {
        monitors: [
          monitorRow('Limpeza em Limoeiro', 'limpeza', 3, { municipality_ibge: [LIMOEIRO] }),
        ],
      },
    });
    const rb = await radar(db).forYou('b');
    expect(rb.interests).toEqual([{ label: 'Limpeza em Limoeiro', source: 'monitor' }]);
    expect(rb.items.map((x) => x.procurement.organ.municipality)).toEqual(['Limoeiro do Norte']);
    expect(JSON.stringify(rb)).not.toContain('Crateús');
    const ra = await radar(db).forYou('a');
    expect(ra.interests.map((i) => i.label)).toEqual(['licitações em Crateús']);
    expect(JSON.stringify(ra)).not.toContain('Limoeiro');
  });

  it('o limite é de 10 editais e 6 interesses', async () => {
    const many: Row[] = Array.from({ length: 15 }, (_, n) =>
      row('Crateús', CRATEUS, `Aquisição de material ${n}`),
    );
    const { db } = fakeDb(many, {
      u1: {
        chat: turn('c1', 90, 'licitações em Crateús', { municipality: [CRATEUS_ONLY] }),
        monitors: Array.from({ length: 8 }, (_, n) =>
          monitorRow(`Monitor ${n}`, `material ${n}`, n + 1),
        ),
      },
    });
    const r = await radar(db).forYou('u1');
    expect(r.interests.length).toBeLessThanOrEqual(6);
    expect(r.items).toHaveLength(10);
  });

  it('um interesse que falha não derruba os outros', async () => {
    const { db } = fakeDb(
      DATA,
      {
        u1: {
          chat: turn('c1', 30, 'licitações em Crateús', { municipality: [CRATEUS_ONLY] }),
          monitors: [monitorRow('Vai falhar', 'quebrar', 2)],
        },
      },
      { failOn: 'quebrar' },
    );
    const r = await radar(db).forYou('u1');
    expect(r.interests.map((i) => i.label)).toEqual(['Vai falhar', 'licitações em Crateús']);
    expect(r.items).toHaveLength(3);
    expect(r.empty).toBeNull();
  });

  it('só devolve edital aberto: encerrado e de outro estado nunca entram', async () => {
    const closed = row('Crateús', CRATEUS, 'Aquisição de material já encerrada');
    closed.status = 'closed';
    closed.proposals_close_at = new Date('2026-10-01T12:00:00Z');
    const sp = row('São Paulo', '3550308', 'Aquisição de material em São Paulo');
    sp.uf = 'SP';
    const { db } = fakeDb([...DATA, closed, sp], {
      u1: { monitors: [monitorRow('Material', 'material', 1)] },
    });
    const r = await radar(db).forYou('u1');
    const objects = r.items.map((x) => x.procurement.object);
    expect(objects.some((o) => o.includes('já encerrada'))).toBe(false);
    expect(objects.some((o) => o.includes('São Paulo'))).toBe(false);
    expect(r.items.length).toBeGreaterThan(0);
  });
});
