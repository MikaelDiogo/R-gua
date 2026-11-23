import type { FetchStatus } from '../types';
import { PncpPagina } from './schema';

export interface PncpClientOptions {
  baseUrl?: string;
  /** Teto conservador e configurável (docs/05 §3): a API devolve 429 em rajada, sem informar o limite. */
  maxCallsPerMinute?: number;
  maxRetries?: number;
  timeoutMs?: number;
  breakerThreshold?: number;
  breakerCooldownMs?: number;
  userAgent?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

export interface PncpResponse {
  status: FetchStatus;
  httpStatus: number;
  /** Corpo como veio (JSON parseado ou texto quando não for JSON, ex.: 429 em HTML). */
  body: unknown;
  page?: PncpPagina;
  error?: string;
  /** `Retry-After` do 429, quando o PNCP informa (nem sempre informa). */
  retryAfterSec?: number;
}

type Params = Record<string, string | number | undefined>;

const DEFAULT_BASE_URL = 'https://pncp.gov.br/api/consulta';

/**
 * Cliente HTTP do PNCP: rate limit, timeout, retry com backoff + jitter, circuit breaker por endpoint e
 * classificação honesta do resultado (`empty` só em 200/204 válido; 429 e erros nunca viram "vazio").
 */
export class PncpClient {
  private readonly baseUrl: string;
  private readonly interval: number;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly breakerThreshold: number;
  private readonly breakerCooldownMs: number;
  private readonly userAgent: string;
  private readonly doFetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;
  private nextSlotAt = 0;
  private readonly breakers = new Map<string, { failures: number; openUntil: number }>();

  constructor(opts: PncpClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.interval = 60_000 / (opts.maxCallsPerMinute ?? 12);
    this.maxRetries = opts.maxRetries ?? 3;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.breakerThreshold = opts.breakerThreshold ?? 5;
    this.breakerCooldownMs = opts.breakerCooldownMs ?? 60_000;
    this.userAgent = opts.userAgent ?? 'agora-ingestion/0.0 (+licitacoes)';
    this.doFetch = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
  }

  async get(endpoint: string, params: Params): Promise<PncpResponse> {
    const breaker = this.breakers.get(endpoint) ?? { failures: 0, openUntil: 0 };
    this.breakers.set(endpoint, breaker);
    if (breaker.openUntil > this.now()) {
      return { status: 'upstream_error', httpStatus: 0, body: null, error: 'circuit_open' };
    }

    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
    const url = `${this.baseUrl}${endpoint}?${qs.toString()}`;

    let last: PncpResponse = { status: 'upstream_error', httpStatus: 0, body: null };
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this.acquire();
      last = await this.once(url);

      if (last.status === 'ok' || last.status === 'empty') {
        breaker.failures = 0;
        return last;
      }
      if (last.status === 'schema_mismatch') return last; // retry não conserta contrato
      if (last.httpStatus >= 400 && last.httpStatus < 500 && last.httpStatus !== 429) {
        return last; // erro nosso (parâmetro inválido): sem retry e sem abrir o breaker
      }
      if (attempt < this.maxRetries) await this.sleep(this.backoff(attempt, last));
    }

    breaker.failures += 1;
    if (breaker.failures >= this.breakerThreshold) {
      breaker.openUntil = this.now() + this.breakerCooldownMs;
      breaker.failures = 0;
    }
    return last;
  }

  /** Espaça as chamadas em `interval` ms. A reserva do slot é síncrona, então é segura sob concorrência. */
  private async acquire(): Promise<void> {
    const now = this.now();
    const slot = Math.max(now, this.nextSlotAt);
    this.nextSlotAt = slot + this.interval;
    const wait = slot - now;
    if (wait > 0) await this.sleep(wait);
  }

  private backoff(attempt: number, res: PncpResponse): number {
    if (res.httpStatus === 429 && res.retryAfterSec) {
      return Math.min(120_000, res.retryAfterSec * 1000);
    }
    const base = res.httpStatus === 429 ? 5_000 : 1_000;
    const jitter = 0.5 + this.random();
    return Math.min(30_000, base * 2 ** attempt * jitter);
  }

  private async once(url: string): Promise<PncpResponse> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.doFetch(url, {
        headers: { accept: 'application/json', 'user-agent': this.userAgent },
        signal: ctrl.signal,
      });
      const httpStatus = res.status;
      if (httpStatus === 204) return { status: 'empty', httpStatus, body: null };

      const text = await res.text();
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        /* corpo não JSON (ex.: 429 em HTML): mantém o texto */
      }

      if (httpStatus === 429) {
        const ra = Number(res.headers.get('retry-after'));
        const out: PncpResponse = {
          status: 'rate_limited',
          httpStatus,
          body: typeof body === 'string' ? body.slice(0, 500) : body,
        };
        if (Number.isFinite(ra) && ra > 0) out.retryAfterSec = ra;
        return out;
      }
      if (httpStatus >= 500) {
        return {
          status: 'upstream_error',
          httpStatus,
          body: truncate(body),
          error: `http_${httpStatus}`,
        };
      }
      if (httpStatus !== 200) {
        return {
          status: 'upstream_error',
          httpStatus,
          body: truncate(body),
          error: errorMessage(body, httpStatus),
        };
      }

      const parsed = PncpPagina.safeParse(body);
      if (!parsed.success) {
        return {
          status: 'schema_mismatch',
          httpStatus,
          body: truncate(body),
          error: parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')
            .slice(0, 300),
        };
      }
      const page = parsed.data;
      return {
        status: page.data.length === 0 && page.totalRegistros === 0 ? 'empty' : 'ok',
        httpStatus,
        body,
        page,
      };
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      return {
        status: 'upstream_error',
        httpStatus: 0,
        body: null,
        error: aborted ? 'timeout' : `network: ${String(e)}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

function truncate(body: unknown): unknown {
  return typeof body === 'string' ? body.slice(0, 500) : body;
}

function errorMessage(body: unknown, httpStatus: number): string {
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
    return `http_${httpStatus}: ${body.message}`;
  }
  return `http_${httpStatus}`;
}
