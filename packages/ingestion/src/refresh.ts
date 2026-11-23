import type { Db } from '@agora/db';
import { collectWindow } from './collect';
import { PncpClient } from './pncp/client';
import { EP_PUBLICACAO, PncpConnector } from './pncp/connector';
import { fromPncpDate, toPncpDate } from './pncp/time';
import type { IngestWindow } from './types';

export interface RefreshOptions {
  /** Tempo máximo da chamada (padrão 25 s). Ao estourar, devolve o que conseguiu com `complete: false`; nunca lança. */
  maxMs?: number;
  /** Se vier, busca também as publicadas nos últimos `days` dias (todas as situações). Sem ele, só as abertas. */
  days?: number;
  /** Para teste. */
  client?: PncpClient;
  now?: () => Date;
}

export interface RefreshResult {
  /** Registros lidos do PNCP. */
  fetched: number;
  /** Registros novos ou alterados que entraram no banco. */
  upserted: number;
  /** true só se todas as páginas de todas as consultas vieram dentro do prazo. */
  complete: boolean;
  /** true quando a resposta é de uma coleta recente do mesmo município (não chamou o PNCP de novo). */
  cached?: boolean;
}

/** Ordem em que as modalidades são consultadas quando o tempo é curto: as mais comuns em CE e PI primeiro. */
const MODALITY_PRIORITY = [8, 6, 4, 12, 9, 7, 5, 3, 1, 2, 10, 11, 13];
const CACHE_MS = 10 * 60_000;

/**
 * UM cliente para o processo inteiro: o limite de chamadas por minuto vale para todos os usuários juntos
 * (20/min, o teto combinado com o PNCP), e a coleta ao vivo responde rápido (poucas tentativas, timeout curto).
 */
let shared: PncpClient | undefined;
const sharedClient = () =>
  (shared ??= new PncpClient({ maxCallsPerMinute: 20, maxRetries: 1, timeoutMs: 8_000 }));

const inflight = new Map<string, Promise<RefreshResult>>();
const recent = new Map<string, { at: number; result: RefreshResult }>();

/**
 * Coleta AO VIVO no PNCP o que um município tem e grava no banco, para a busca nunca depender só da última
 * carga agendada. Primeiro as propostas abertas (UMA consulta: a API aceita omitir a modalidade e filtrar pelo
 * município); depois, se `days` vier, as publicadas no período, modalidade por modalidade.
 * Duas chamadas simultâneas para o mesmo município dividem a mesma coleta; repetir em até 10 min devolve o
 * resultado anterior. Nunca lança.
 */
export function refreshMunicipality(
  db: Db,
  ibge: string,
  opts: RefreshOptions = {},
): Promise<RefreshResult> {
  const key = `${ibge}|${opts.days ?? 0}`;
  const now = (opts.now ?? (() => new Date()))().getTime();
  const hit = recent.get(key);
  if (hit && now - hit.at < CACHE_MS && !opts.client)
    return Promise.resolve({ ...hit.result, cached: true });
  const running = inflight.get(key);
  if (running) return running;

  const p = run(db, ibge, opts).then((result) => {
    if (result.complete && !opts.client) recent.set(key, { at: now, result });
    return result;
  });
  inflight.set(key, p);
  const clear = () => inflight.delete(key);
  p.then(clear, clear);
  return p;
}

async function run(db: Db, ibge: string, opts: RefreshOptions): Promise<RefreshResult> {
  const maxMs = opts.maxMs ?? 25_000;
  const clock = opts.now ?? (() => new Date());
  const deadline = clock().getTime() + maxMs;
  const connector = new PncpConnector({ client: opts.client ?? sharedClient(), now: clock });
  const totals = { fetched: 0, upserted: 0, complete: true };

  async function work(): Promise<void> {
    const today = toPncpDate(clock());
    const windows: IngestWindow[] = [
      connector.openProposalsWindow(
        new Date(clock().getTime() + 365 * 86_400_000),
        undefined,
        undefined,
        ibge,
      ),
    ];
    if (opts.days && opts.days > 0) {
      const start = toPncpDate(
        new Date(fromPncpDate(today).getTime() - (opts.days - 1) * 86_400_000),
      );
      for (const modality of MODALITY_PRIORITY) {
        windows.push({
          source: 'pncp',
          endpoint: EP_PUBLICACAO,
          modality,
          municipalityIbge: ibge,
          start,
          end: today,
        });
      }
    }
    for (const w of windows) {
      if (clock().getTime() > deadline) {
        totals.complete = false;
        return;
      }
      const r = await collectWindow(db, connector, w, { record: false, deadline });
      totals.fetched += r.fetched;
      totals.upserted += r.stats.inserted + r.stats.updated;
      if (!r.complete) totals.complete = false;
    }
  }

  // Teto duro: se o PNCP engasgar, a chamada não passa de maxMs (+ folga), e o que já foi gravado fica.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      totals.complete = false;
      resolve();
    }, maxMs + 2_000);
    timer.unref?.();
  });
  try {
    await Promise.race([work(), stop]);
  } catch (e) {
    totals.complete = false;
    console.error('[refreshMunicipality] falha', ibge, e instanceof Error ? e.message : e);
  } finally {
    clearTimeout(timer);
  }
  return { ...totals };
}

/** Só para teste: zera cache e coletas em andamento. */
export function __resetRefreshState(): void {
  recent.clear();
  inflight.clear();
  shared = undefined;
}
