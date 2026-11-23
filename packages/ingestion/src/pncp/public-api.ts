import { z } from 'zod';

const num = z.number().nullish();
const PncpItemSchema = z
  .object({
    numeroItem: z.number().int(),
    descricao: z.string(),
    quantidade: num,
    unidadeMedida: z.string().nullish(),
    valorUnitarioEstimado: num,
    valorTotal: num,
    materialOuServicoNome: z.string().nullish(),
    situacaoCompraItemNome: z.string().nullish(),
  })
  .passthrough();
export type PncpItem = z.infer<typeof PncpItemSchema>;

const PncpDocSchema = z
  .object({
    sequencialDocumento: z.number().int(),
    titulo: z.string().nullish(),
    tipoDocumentoNome: z.string().nullish(),
    url: z.string(),
    statusAtivo: z.boolean().nullish(),
  })
  .passthrough();
export type PncpDoc = z.infer<typeof PncpDocSchema>;

export type PublicApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

export interface PublicApiOptions {
  /** Novas tentativas no download quando o PNCP falha ao acaso (padrão 5). */
  downloadRetries?: number;
  /** Pausa base entre tentativas, em ms (cresce a cada tentativa). */
  retryDelayMs?: number;
  baseUrl?: string;
  maxCallsPerMinute?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const TRANSIENT_STATUS = new Set([408, 422, 425, 429, 500, 502, 503, 504]);
const isTransient = (r: { status: number; error: string }) =>
  TRANSIENT_STATUS.has(r.status) || r.error === 'network' || r.error === 'timeout';

const ALLOWED_HOSTS = (h: string) => h === 'pncp.gov.br' || h.endsWith('.pncp.gov.br');

/**
 * API pública do PNCP (itens e arquivos de uma contratação), usada sob demanda quando alguém abre um edital.
 * Mesmo cuidado da coleta: espaçamento entre chamadas, timeout e status explícito (docs/05 §8).
 * O download só aceita hosts do PNCP, com limite de tamanho (docs/10 §5).
 */
export class PncpPublicApi {
  private readonly baseUrl: string;
  private readonly interval: number;
  private readonly timeoutMs: number;
  private readonly doFetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly downloadRetries: number;
  private readonly retryDelayMs: number;
  private nextSlot = 0;

  constructor(opts: PublicApiOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'https://pncp.gov.br/api/pncp').replace(/\/$/, '');
    this.interval = 60_000 / (opts.maxCallsPerMinute ?? 20);
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.doFetch = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
    this.downloadRetries = opts.downloadRetries ?? 5;
    this.retryDelayMs = opts.retryDelayMs ?? 1200;
  }

  private async acquire() {
    const t = this.now();
    const slot = Math.max(t, this.nextSlot);
    this.nextSlot = slot + this.interval;
    if (slot > t) await this.sleep(slot - t);
  }

  private async getJson(path: string): Promise<PublicApiResult<unknown>> {
    await this.acquire();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.doFetch(`${this.baseUrl}${path}`, {
        headers: { accept: 'application/json' },
        signal: ctrl.signal,
      });
      if (res.status === 204) return { ok: true, data: [] };
      if (res.status === 429) return { ok: false, status: 429, error: 'rate_limited' };
      if (!res.ok) return { ok: false, status: res.status, error: `http_${res.status}` };
      const text = await res.text();
      try {
        return { ok: true, data: text ? JSON.parse(text) : [] };
      } catch {
        return { ok: false, status: res.status, error: 'schema_mismatch' };
      }
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      return { ok: false, status: 0, error: aborted ? 'timeout' : 'network' };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Itens da contratação, paginando até acabar. Erro nunca vira "sem itens". */
  async items(cnpj: string, year: number, seq: number): Promise<PublicApiResult<PncpItem[]>> {
    const out: PncpItem[] = [];
    for (let page = 1; page <= 40; page++) {
      const r = await this.getJson(
        `/v1/orgaos/${cnpj}/compras/${year}/${seq}/itens?pagina=${page}&tamanhoPagina=100`,
      );
      if (!r.ok) return r;
      const arr = Array.isArray(r.data) ? r.data : [];
      for (const raw of arr) {
        const p = PncpItemSchema.safeParse(raw);
        if (!p.success) return { ok: false, status: 200, error: 'schema_mismatch' };
        out.push(p.data);
      }
      if (arr.length < 100) break;
    }
    return { ok: true, data: out };
  }

  async documents(cnpj: string, year: number, seq: number): Promise<PublicApiResult<PncpDoc[]>> {
    const r = await this.getJson(`/v1/orgaos/${cnpj}/compras/${year}/${seq}/arquivos`);
    if (!r.ok) return r;
    const arr = Array.isArray(r.data) ? r.data : [];
    const out: PncpDoc[] = [];
    for (const raw of arr) {
      const p = PncpDocSchema.safeParse(raw);
      if (!p.success) return { ok: false, status: 200, error: 'schema_mismatch' };
      out.push(p.data);
    }
    return { ok: true, data: out };
  }

  /**
   * Baixa um arquivo do PNCP com novas tentativas. O armazenamento de arquivos do PNCP falha ao acaso: o mesmo
   * arquivo responde 200 numa chamada e 422 "Erro ao tentar carregar arquivo" na seguinte. Só falha de origem
   * é repetida; host proibido, arquivo grande demais e 404 não são.
   */
  async download(
    url: string,
    maxBytes: number,
  ): Promise<PublicApiResult<{ bytes: Uint8Array; filename: string | null }>> {
    let last = await this.downloadOnce(url, maxBytes);
    for (let i = 1; i <= this.downloadRetries && !last.ok && isTransient(last); i++) {
      await this.sleep(this.retryDelayMs * i);
      last = await this.downloadOnce(url, maxBytes);
    }
    return last;
  }

  private async downloadOnce(
    url: string,
    maxBytes: number,
  ): Promise<PublicApiResult<{ bytes: Uint8Array; filename: string | null }>> {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return { ok: false, status: 0, error: 'invalid_url' };
    }
    if (u.protocol !== 'https:' || !ALLOWED_HOSTS(u.host)) {
      return { ok: false, status: 0, error: 'host_not_allowed' };
    }
    await this.acquire();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const res = await this.doFetch(u.toString(), { signal: ctrl.signal });
      if (res.url && !ALLOWED_HOSTS(new URL(res.url).host)) {
        return { ok: false, status: 0, error: 'host_not_allowed' };
      }
      if (!res.ok) return { ok: false, status: res.status, error: `http_${res.status}` };
      const declared = Number(res.headers.get('content-length') ?? 0);
      if (declared > maxBytes) return { ok: false, status: 200, error: 'too_large' };
      const reader = res.body?.getReader();
      if (!reader) return { ok: false, status: 200, error: 'empty' };
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) {
          await reader.cancel();
          return { ok: false, status: 200, error: 'too_large' };
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let off = 0;
      for (const c of chunks) {
        bytes.set(c, off);
        off += c.length;
      }
      const cd = res.headers.get('content-disposition') ?? '';
      const filename = /filename="?([^";]+)"?/i.exec(cd)?.[1] ?? null;
      return { ok: true, data: { bytes, filename } };
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      return { ok: false, status: 0, error: aborted ? 'timeout' : 'network' };
    } finally {
      clearTimeout(timer);
    }
  }
}
