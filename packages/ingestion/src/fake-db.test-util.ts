import type { Db } from '@agora/db';

export interface FakeDb {
  db: Db;
  known: Map<string, string>;
  windows: Map<string, { state: string; ageHours: number }>;
  log: string[];
  seedWindow(
    endpoint: string,
    modality: number,
    start: string,
    end: string,
    state: string,
    ageHours: number,
  ): void;
}

/** Banco falso em memória: só o que a gravação do PNCP usa. Nada de rede, nada de Docker. */
export function fakeDb(): FakeDb {
  const known = new Map<string, string>(); // numero_controle_pncp → content_hash
  const windows = new Map<string, { state: string; ageHours: number }>();
  const log: string[] = [];
  let seq = 0;

  const key = (p: unknown[]) => p.slice(0, 5).join('|');

  const query = async (sql: string, params: unknown[] = []) => {
    log.push(sql.replace(/\s+/g, ' ').trim().slice(0, 60));
    if (sql.includes('numero_controle_pncp = ANY')) {
      const keys = (params[0] as string[]).filter((k) => known.has(k));
      return { rows: keys.map((k) => ({ numero_controle_pncp: k })), rowCount: keys.length };
    }
    if (sql.includes('FROM procurements WHERE numero_controle_pncp')) {
      const hash = known.get(String(params[0]));
      return {
        rows: hash
          ? [
              {
                id: 'x',
                content_hash: hash,
                proposals_close_at: null,
                status: 'unknown',
                estimated_value: null,
              },
            ]
          : [],
        rowCount: hash ? 1 : 0,
      };
    }
    if (sql.includes('INSERT INTO procurements')) {
      known.set(String(params[0]), String(params[24]));
      return { rows: [{ id: `id-${++seq}` }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO ingest_window')) {
      windows.set(key(params), { state: String(params[5]), ageHours: 0 });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('FROM ingest_window')) {
      const w = windows.get(key(params));
      return {
        rows: w ? [{ state: w.state, age_hours: String(w.ageHours) }] : [],
        rowCount: w ? 1 : 0,
      };
    }
    return { rows: [], rowCount: 0 };
  };

  const client = { query, release: () => undefined };
  const db = { query, connect: async () => client } as unknown as Db;
  return {
    db,
    known,
    windows,
    log,
    /** Pré-carrega o registro de uma janela (para testar a retomada). */
    seedWindow(
      endpoint: string,
      modality: number,
      start: string,
      end: string,
      state: string,
      ageHours: number,
    ) {
      windows.set(['pncp', endpoint, modality, start, end].join('|'), { state, ageHours });
    },
  };
}
