import { type ApiResult, api } from './api';
import { type Failure, failureOf } from './failure';

/** Chamadas de IA levam de 20 a 90 s; o proxy do Next espera até 100 s. */
export const LONG_TIMEOUT_MS = 95_000;

export type CallOutcome<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      cancelled: boolean;
      failure: Failure;
      raw: Extract<ApiResult<T>, { ok: false }> | null;
    };

/**
 * Chamada longa com tempo limite e cancelamento. Nunca lança. `cancelled` = a pessoa cancelou (não é erro).
 * O estouro de tempo vira uma falha com texto próprio, nunca "sem resultados".
 */
export async function callLong<T>(
  path: string,
  init: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT';
    body?: unknown;
    headers?: Record<string, string>;
  },
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<CallOutcome<T>> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, opts.timeoutMs ?? LONG_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onAbort);

  const r = await api<T>(path, { ...init, signal: ctrl.signal });
  window.clearTimeout(timer);
  opts.signal?.removeEventListener('abort', onAbort);

  if (r.ok) return { ok: true, data: r.data };
  if (timedOut) {
    return {
      ok: false,
      cancelled: false,
      raw: null,
      failure: {
        title: 'O servidor demorou mais do que o esperado.',
        detail: 'Passou do tempo limite sem resposta. Tente de novo em instantes.',
        retryable: true,
      },
    };
  }
  if (opts.signal?.aborted) {
    return {
      ok: false,
      cancelled: true,
      raw: r,
      failure: { title: 'Cancelado.', detail: '', retryable: false },
    };
  }
  return { ok: false, cancelled: false, raw: r, failure: failureOf(r) };
}
