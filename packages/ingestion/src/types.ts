import type { ProcurementStatus, Sphere } from '@agora/contracts';

/**
 * Estado explícito de toda coleta (docs/05 §8). `empty` só existe quando houve 200/204 válido:
 * 429 ou erro NUNCA vira "nenhum resultado".
 */
export type FetchStatus = 'ok' | 'empty' | 'rate_limited' | 'upstream_error' | 'schema_mismatch';

/** Unidade idempotente de coleta (tabela `ingest_window`, docs/07 §3). Datas no formato do PNCP: yyyyMMdd. */
export interface IngestWindow {
  source: string;
  endpoint: string;
  modality?: number;
  /** Sigla da UF (a API do PNCP filtra por ela). */
  uf?: string;
  /** yyyyMMdd (inclusive) */
  start: string;
  /** yyyyMMdd (inclusive) */
  end: string;
}

/** Corpo bruto de uma página, para `ingest_raw` (reprocessar sem chamar o PNCP de novo). */
export interface RawPage {
  endpoint: string;
  params: Record<string, string | number>;
  httpStatus: number;
  status: FetchStatus;
  fetchedAt: string;
  body: unknown;
}

export interface SourceFetchResult {
  status: FetchStatus;
  /** false quando alguma página falhou: os itens já coletados são válidos, a janela fica `partial`. */
  complete: boolean;
  items: NormalizedProcurement[];
  raw: RawPage[];
  pagesFetched: number;
  totalPages: number | null;
  totalRecords: number | null;
  error?: string;
}

export type QualityFlag =
  | 'date_suspect'
  | 'value_suspect'
  | 'value_missing'
  | 'proposal_dates_inverted'
  | 'pii_masked'
  | 'organ_incomplete';

/** Registro canônico (docs/07 `procurements` + `organs`). Datas em UTC ISO-8601. */
export interface NormalizedProcurement {
  source: string;
  numeroControlePncp: string;
  organ: {
    cnpj: string;
    name: string;
    sphere: Sphere | null;
    power: string | null;
    uf: string | null;
    municipalityIbge: string | null;
    municipalityName: string | null;
    unitName: string | null;
  };
  processNumber: string | null;
  editalNumber: string | null;
  year: number;
  sequence: number;
  modality: number;
  modalityName: string;
  status: ProcurementStatus;
  statusRaw: string;
  objectText: string;
  objectRaw: string;
  estimatedValue: number | null;
  publishedAt: string | null;
  proposalsOpenAt: string | null;
  proposalsCloseAt: string | null;
  pncpUpdatedAt: string | null;
  srp: boolean;
  isOpen: boolean;
  qualityFlags: QualityFlag[];
  /** Hash dos campos que afetam busca e IA: se não mudou, não reenfileira embedding (docs/05 §7). */
  contentHash: string;
  sourceUrl: string | null;
  originSystemUrl: string | null;
}

/** Porta de fonte (docs/05 §2.1). */
export interface SourceConnector {
  readonly id: string;
  listWindows(since: Date, until?: Date): AsyncIterable<IngestWindow>;
  fetch(window: IngestWindow): Promise<SourceFetchResult>;
  normalize(raw: unknown, now?: Date): NormalizedProcurement[];
  matchKeys(p: NormalizedProcurement): string[];
}
