import { z } from 'zod';
import { ModalityCode, ProcurementStatus, Sphere, UF } from './common';

const range = <T extends z.ZodTypeAny>(t: T) =>
  z.object({ from: t.optional(), to: t.optional() }).strict();

/**
 * O que o cliente envia para buscar (`06` §2). O servidor nunca aceita SQL, colunas, pesos ou nome de modelo.
 * `.strict()` rejeita chaves desconhecidas (`04` §10).
 */
export const SearchIntent = z
  .object({
    q: z.string().max(500).optional(),
    mode: z.enum(['hybrid', 'lexical']).default('hybrid'),
    filters: z
      .object({
        uf: z.array(UF).max(27).optional(),
        municipality_ibge: z.array(z.string()).max(50).optional(),
        modality: z.array(ModalityCode).max(13).optional(),
        status: z.array(ProcurementStatus).optional(),
        value: z
          .object({
            min: z.number().nonnegative().optional(),
            max: z.number().nonnegative().optional(),
          })
          .strict()
          .optional(),
        proposals_deadline: range(z.string().datetime()).optional(),
        published: range(z.string().datetime()).optional(),
        organ_cnpj: z.array(z.string()).max(50).optional(),
        sphere: z.array(Sphere).optional(),
        cnae_hint: z.array(z.string()).max(20).optional(),
      })
      .strict()
      .default({}),
    sort: z
      .enum(['relevance', 'deadline_asc', 'published_desc', 'value_desc'])
      .default('relevance'),
    cursor: z.string().optional(),
    /** Paginação por número de página (a UI pagina assim); profundidade máxima 100 páginas. Keyset por cursor fica para a escala (docs/06 §8). */
    page: z.number().int().min(1).max(100).default(1),
    limit: z.number().int().min(1).max(50).default(20),
    facets: z
      .array(z.enum(['uf', 'modality', 'value_band', 'status', 'sphere']))
      .max(5)
      .default([]),
    profile_id: z.string().uuid().optional(),
    ai_profile_id: z.string().uuid().optional(),
  })
  .strict();
export type SearchIntent = z.infer<typeof SearchIntent>;
export type SearchIntentInput = z.input<typeof SearchIntent>;

export const SearchMeta = z.object({
  total_estimate: z.number().int().nonnegative(),
  total_exact: z.boolean(),
  legs: z.object({
    lexical: z.enum(['ok', 'skipped', 'failed']),
    semantic: z.enum(['ok', 'skipped', 'failed']),
    rerank: z.enum(['ok', 'skipped', 'failed']),
  }),
  degraded: z.array(z.enum(['semantic', 'rerank', 'nl_understanding', 'lexical_bm25'])),
  index_freshness_at: z.string().datetime(),
  took_ms: z.number().nonnegative(),
  /** O que o servidor entendeu do texto e aplicou como filtro (ex.: "Crateús" virou o município 2304103). */
  applied: z
    .object({
      municipalities: z.array(
        z.object({ name: z.string(), ibge: z.string(), uf: z.enum(['CE', 'PI']) }),
      ),
      /** Texto que continuou valendo na busca (vazio = só o lugar foi pedido). */
      text: z.string().nullable(),
    })
    .optional(),
});
export type SearchMeta = z.infer<typeof SearchMeta>;

/** Autocomplete de município (CE e PI): GET /v1/municipalities?q=&limit= */
export const MunicipalitiesQuery = z
  .object({
    q: z.string().max(80).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();
export type MunicipalitiesQuery = z.infer<typeof MunicipalitiesQuery>;

export const MunicipalitiesResponse = z.object({
  items: z.array(z.object({ name: z.string(), ibge: z.string(), uf: z.enum(['CE', 'PI']) })),
  server_now: z.string().datetime(),
});
export type MunicipalitiesResponse = z.infer<typeof MunicipalitiesResponse>;
