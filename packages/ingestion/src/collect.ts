import type { Db } from '@agora/db';
import { PncpConnector } from './pncp/connector';
import { registryWindow } from './pncp/windows';
import { recordWindow, saveRaw, type UpsertStats, upsertProcurements } from './store';
import type { FetchStatus, IngestWindow } from './types';

export interface CollectOptions {
  /** Guarda o corpo bruto de cada página em `ingest_raw` (cresce rápido: desligue em cargas históricas). */
  saveRawPages?: boolean;
  /** Registra o andamento em `ingest_window` (padrão sim). A coleta ao vivo por município não registra. */
  record?: boolean;
  /** Epoch ms: para de buscar páginas depois disso e devolve o que veio (`complete: false`). */
  deadline?: number;
}

export interface CollectResult {
  status: FetchStatus;
  /** true só se todas as páginas vieram (nada cortado, nada falhou). */
  complete: boolean;
  fetched: number;
  stats: UpsertStats;
  pagesFetched: number;
  totalPages: number | null;
  error?: string;
}

/**
 * Coleta UMA janela do PNCP e grava. Estado honesto em `ingest_window` (docs/05 §8): `ok` só quando todas as
 * páginas vieram; corte por limite de páginas ou por prazo vira `partial`; erro vira `failed`. Janela vazia
 * (204/200 vazio) é `ok`. O que foi coletado antes de uma falha também é gravado (o upsert é idempotente).
 */
export async function collectWindow(
  db: Db,
  connector: PncpConnector,
  w: IngestWindow,
  opts: CollectOptions = {},
): Promise<CollectResult> {
  const record = opts.record ?? true;
  const key = registryWindow(w);
  if (record) await recordWindow(db, key, 'running', 0);

  const r = await connector.fetch(
    w,
    opts.deadline === undefined ? {} : { deadline: opts.deadline },
  );
  if (opts.saveRawPages) await saveRaw(db, 'pncp', r.raw);
  const stats = await upsertProcurements(db, r.items);

  // `maxPages` e `deadline` cortam de propósito: "ok" com páginas restantes é parcial.
  const truncated = r.totalPages !== null && r.pagesFetched < r.totalPages && r.status === 'ok';
  const complete = (r.status === 'ok' && r.complete && !truncated) || r.status === 'empty';
  const state =
    r.status === 'ok' || r.status === 'empty' ? (complete ? 'ok' : 'partial') : 'failed';
  if (record) await recordWindow(db, key, state, r.items.length, r.error);

  return {
    status: r.status,
    complete,
    fetched: r.items.length,
    stats,
    pagesFetched: r.pagesFetched,
    totalPages: r.totalPages,
    ...(r.error ? { error: r.error } : {}),
  };
}
