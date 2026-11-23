import { z } from 'zod';
import { ProcurementStatus } from './common';
import { ProcurementDocument, ProcurementItem } from './proposal';
import { SearchMeta } from './search';

/** Nível do prazo de propostas. Calculado SEMPRE no servidor (docs/04 §4); o texto sempre diz o prazo, a cor só reforça. */
export const DeadlineLevel = z.enum(['ok', 'soon', 'critical', 'closed', 'unknown']);
export type DeadlineLevel = z.infer<typeof DeadlineLevel>;

export const Deadline = z.object({
  level: DeadlineLevel,
  /** Ex.: "encerra em 3 dias úteis · qui 12/11 17:00", "encerrado em 02/11", "prazo não informado". */
  label: z.string(),
  business_days: z.number().int().nullable(),
  /** Dias corridos até o encerramento (hoje = 0; negativo se encerrado). Desenha a régua de prazos. */
  calendar_days: z.number().int().nullable(),
  /** Fração do período de propostas já decorrida (0 a 1); null sem datas. */
  progress: z.number().min(0).max(1).nullable(),
});
export type Deadline = z.infer<typeof Deadline>;

/** Trecho do texto com marca de termo encontrado. Segmentos em vez de HTML: nada de HTML do servidor no cliente. */
export const HighlightSegment = z.object({ text: z.string(), match: z.boolean() });
export type HighlightSegment = z.infer<typeof HighlightSegment>;

export const ProcurementSummary = z.object({
  id: z.string().uuid(),
  numero_controle_pncp: z.string(),
  object: z.string(),
  highlight: z.array(HighlightSegment).nullable(),
  organ: z.object({
    cnpj: z.string(),
    name: z.string(),
    uf: z.string().nullable(),
    municipality: z.string().nullable(),
  }),
  modality: z.object({ code: z.number().int(), name: z.string() }),
  status: ProcurementStatus,
  estimated_value: z.number().nullable(),
  published_at: z.string().datetime().nullable(),
  proposals_open_at: z.string().datetime().nullable(),
  proposals_close_at: z.string().datetime().nullable(),
  deadline: Deadline,
  quality_flags: z.array(z.string()),
  /** Só 'lexical' enquanto não houver perna vetorial. */
  match: z.enum(['lexical', 'semantic', 'both']).nullable(),
  source_url: z.string().nullable(),
  origin_url: z.string().nullable(),
});
export type ProcurementSummary = z.infer<typeof ProcurementSummary>;

export const ProcurementDetail = ProcurementSummary.extend({
  process_number: z.string().nullable(),
  edital_number: z.string().nullable(),
  year: z.number().int(),
  sequence: z.number().int(),
  srp: z.boolean(),
  status_raw: z.string(),
  sphere: z.string().nullable(),
  unit_name: z.string().nullable(),
  municipality_ibge: z.string().nullable(),
  /** Itens e documentos ainda não são coletados: lista vazia + `collected=false`, nunca "sem itens". */
  items: z.object({ collected: z.boolean(), list: z.array(ProcurementItem) }),
  documents: z.object({ collected: z.boolean(), list: z.array(ProcurementDocument) }),
});
export type ProcurementDetail = z.infer<typeof ProcurementDetail>;

const FacetBucket = z.object({ value: z.string(), label: z.string(), count: z.number().int() });

export const SearchResponse = z.object({
  items: z.array(ProcurementSummary),
  facets: z.object({ uf: z.array(FacetBucket), modality: z.array(FacetBucket) }),
  page: z.number().int().min(1),
  page_size: z.number().int(),
  meta: SearchMeta,
  server_now: z.string().datetime(),
});
export type SearchResponse = z.infer<typeof SearchResponse>;

export const SuggestResponse = z.object({
  terms: z.array(z.string()),
  did_you_mean: z.string().nullable(),
  organs: z.array(z.object({ cnpj: z.string(), name: z.string() })),
  server_now: z.string().datetime(),
});
export type SuggestResponse = z.infer<typeof SuggestResponse>;

export const OrganSuggestResponse = z.object({
  organs: z.array(z.object({ cnpj: z.string(), name: z.string(), uf: z.string().nullable() })),
  server_now: z.string().datetime(),
});

/** Resumo do painel (GET /v1/dashboard). Tudo calculado no servidor sobre os dados coletados. */
export const DashboardResponse = z.object({
  published_today: z.number().int(),
  open_total: z.number().int(),
  closing_in_7_days: z.number().int(),
  /** Soma do valor estimado dos editais do seu funil em preparação, proposta enviada ou disputa. Calculado no servidor; null se nenhum tem valor. */
  proposals_value: z.number().nullable(),
  closing_by_week: z.array(z.object({ week_start: z.string(), count: z.number().int() })),
  closing_soon: z.array(ProcurementSummary),
  index_freshness_at: z.string().datetime().nullable(),
  coverage: z.object({
    procurements_stored: z.number().int(),
    oldest_published_at: z.string().datetime().nullable(),
  }),
  server_now: z.string().datetime(),
});
export type DashboardResponse = z.infer<typeof DashboardResponse>;

export type OrganSuggestResponse = z.infer<typeof OrganSuggestResponse>;
