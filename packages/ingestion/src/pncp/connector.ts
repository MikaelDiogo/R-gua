import type {
  IngestWindow,
  NormalizedProcurement,
  RawPage,
  SourceConnector,
  SourceFetchResult,
} from '../types';
import { PncpClient } from './client';
import { normalizeContratacao } from './normalize';
import { PncpContratacao } from './schema';
import { ALL_MODALITIES } from './tables';
import { fromPncpDate, toPncpDate } from './time';

export const EP_PUBLICACAO = '/v1/contratacoes/publicacao';
export const EP_ATUALIZACAO = '/v1/contratacoes/atualizacao';
export const EP_PROPOSTA = '/v1/contratacoes/proposta';

export interface PncpConnectorOptions {
  client?: PncpClient;
  /** Teto do Swagger em 2026-11-03: 50 em contratações (10 a 50). */
  pageSize?: number;
  /** Largura de cada janela do backfill (docs/05 §5: 1 a 7 dias). */
  windowDays?: number;
  /** Trava de segurança contra paginação infinita. */
  maxPages?: number;
  now?: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class PncpConnector implements SourceConnector {
  readonly id = 'pncp';
  private readonly client: PncpClient;
  private readonly pageSize: number;
  private readonly windowDays: number;
  private readonly maxPages: number;
  private readonly clock: () => Date;

  constructor(opts: PncpConnectorOptions = {}) {
    this.client = opts.client ?? new PncpClient();
    this.pageSize = Math.min(50, Math.max(10, opts.pageSize ?? 50));
    this.windowDays = Math.max(1, opts.windowDays ?? 1);
    this.maxPages = opts.maxPages ?? 2000;
    this.clock = opts.now ?? (() => new Date());
  }

  /**
   * Backfill/incremental por data de publicação: janelas × 13 modalidades, do mais recente para o mais antigo
   * (docs/05 §5.1). Para o incremental por data de atualização, passe `endpoint: EP_ATUALIZACAO`.
   */
  async *listWindows(
    since: Date,
    until: Date = this.clock(),
    endpoint: typeof EP_PUBLICACAO | typeof EP_ATUALIZACAO = EP_PUBLICACAO,
  ): AsyncIterable<IngestWindow> {
    const stepMs = this.windowDays * DAY_MS;
    // Itera por dia civil de Brasília (o PNCP filtra por dia), não por instante: `since` no meio do dia ainda cobre esse dia.
    const sinceDay = fromPncpDate(toPncpDate(since)).getTime();
    for (let end = fromPncpDate(toPncpDate(until)).getTime(); end >= sinceDay; end -= stepMs) {
      const start = Math.max(sinceDay, end - (this.windowDays - 1) * DAY_MS);
      for (const modality of ALL_MODALITIES) {
        yield {
          source: this.id,
          endpoint,
          modality,
          start: toPncpDate(new Date(start)),
          end: toPncpDate(new Date(end)),
        };
      }
    }
  }

  /** Conjunto "quente" (docs/05 §5.3): propostas ainda abertas até `until`. `modality` opcional (a API aceita omitir). */
  openProposalsWindow(
    until: Date,
    modality?: number,
    uf?: string,
    municipalityIbge?: string,
  ): IngestWindow {
    const day = toPncpDate(until);
    return {
      source: this.id,
      endpoint: EP_PROPOSTA,
      modality,
      uf,
      ...(municipalityIbge ? { municipalityIbge } : {}),
      start: day,
      end: day,
    };
  }

  /**
   * Percorre TODAS as páginas da janela (até `maxPages`). `deadline` (epoch ms) interrompe entre páginas: a coleta
   * ao vivo por município precisa responder rápido e devolve `complete: false` com o que já veio.
   */
  async fetch(window: IngestWindow, opts: { deadline?: number } = {}): Promise<SourceFetchResult> {
    const raw: RawPage[] = [];
    const items: NormalizedProcurement[] = [];
    let totalPages: number | null = null;
    let totalRecords: number | null = null;
    let invalidItems = 0;
    let firstInvalid: string | undefined;
    const now = this.clock();

    for (let pagina = 1; pagina <= this.maxPages; pagina++) {
      if (pagina > 1 && opts.deadline !== undefined && this.clock().getTime() > opts.deadline) {
        return done('ok', false, 'deadline');
      }
      const params = this.paramsFor(window, pagina);
      const res = await this.client.get(window.endpoint, params);
      raw.push({
        endpoint: window.endpoint,
        params,
        httpStatus: res.httpStatus,
        status: res.status,
        fetchedAt: this.clock().toISOString(),
        body: res.body,
      });

      if (res.status === 'empty') {
        // 204/200 vazio na 1ª página é "nenhum registro" válido. Em página posterior, a base mudou no meio da coleta.
        if (pagina === 1) {
          return done('empty', true, null);
        }
        return done('upstream_error', false, 'pagina_vazia_inesperada');
      }
      if (res.status !== 'ok' || !res.page) {
        return done(res.status, false, res.error);
      }

      totalPages = res.page.totalPaginas;
      totalRecords = res.page.totalRegistros;
      for (const rec of res.page.data) {
        const parsed = PncpContratacao.safeParse(rec);
        if (parsed.success) items.push(normalizeContratacao(parsed.data, now));
        else {
          invalidItems += 1;
          firstInvalid ??= parsed.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ');
        }
      }
      if (pagina >= totalPages) break;
    }

    if (invalidItems > 0) {
      return done(
        'schema_mismatch',
        false,
        `${invalidItems} registro(s) fora do schema; ex.: ${firstInvalid}`,
      );
    }
    return done('ok', true, undefined);

    function done(
      status: SourceFetchResult['status'],
      complete: boolean,
      error: string | null | undefined,
    ): SourceFetchResult {
      return {
        status,
        complete,
        items,
        raw,
        pagesFetched: raw.length,
        totalPages,
        totalRecords,
        ...(error ? { error } : {}),
      };
    }
  }

  /** Aceita uma página (`{data: [...]}`), uma lista ou um registro; ignora o que não casar com o schema. */
  normalize(raw: unknown, now: Date = this.clock()): NormalizedProcurement[] {
    const list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object' && 'data' in raw && Array.isArray(raw.data)
        ? raw.data
        : [raw];
    const out: NormalizedProcurement[] = [];
    for (const rec of list) {
      const parsed = PncpContratacao.safeParse(rec);
      if (parsed.success) out.push(normalizeContratacao(parsed.data, now));
    }
    return out;
  }

  /** Chaves de deduplicação entre fontes (docs/05 §2.1). `numeroControlePNCP` quando existir; senão órgão+processo+modalidade+ano. */
  matchKeys(p: NormalizedProcurement): string[] {
    const keys = [`pncp:${p.numeroControlePncp}`];
    if (p.processNumber) {
      keys.push(`proc:${p.organ.cnpj}|${p.processNumber}|${p.modality}|${p.year}`);
    }
    return keys;
  }

  private paramsFor(w: IngestWindow, pagina: number): Record<string, string | number> {
    const base = { pagina, tamanhoPagina: this.pageSize };
    if (w.endpoint === EP_PROPOSTA) {
      return {
        dataFinal: w.end,
        ...(w.uf ? { uf: w.uf } : {}),
        ...(w.municipalityIbge ? { codigoMunicipioIbge: w.municipalityIbge } : {}),
        ...(w.modality !== undefined ? { codigoModalidadeContratacao: w.modality } : {}),
        ...base,
      };
    }
    if (w.modality === undefined) throw new Error(`${w.endpoint} exige modalidade`);
    return {
      dataInicial: w.start,
      dataFinal: w.end,
      codigoModalidadeContratacao: w.modality,
      ...(w.uf ? { uf: w.uf } : {}),
      ...(w.municipalityIbge ? { codigoMunicipioIbge: w.municipalityIbge } : {}),
      ...base,
    };
  }
}
