import { z } from 'zod';
import { ProcurementSummary } from './procurements';

/** Pedido de "Busca com IA": texto livre do usuário. O servidor monta prompt, escolhe modelo e filtros (docs/04 §1). */
export const AiSearchRequest = z
  .object({
    prompt: z.string().trim().min(3).max(600),
    /** Quantos resultados devolver (padrão 10). O que não serve também vem, marcado como "não atende". */
    top: z.number().int().min(1).max(20).default(10),
    /** open = só propostas abertas (em vigor); all = em vigor e também os já encerrados/em andamento. */
    scope: z.enum(['open', 'all']).default('all'),
    /** Continua uma conversa existente (do próprio usuário; senão 404). Sem ele, o servidor abre uma conversa nova. */
    conversation_id: z.string().uuid().optional(),
    /** Modos do chat (chips PNCP e Web, independentes). Os dois desligados é inválido: o servidor responde 422. */
    sources: z
      .object({ pncp: z.boolean().default(true), web: z.boolean().default(true) })
      .strict()
      .default({ pncp: true, web: true }),
  })
  .strict();
export type AiSearchRequest = z.infer<typeof AiSearchRequest>;

export const CriterionStatus = z.enum(['meets', 'partial', 'missing', 'unknown']);
export type CriterionStatus = z.infer<typeof CriterionStatus>;

export const AiVerdict = z.enum(['best', 'good', 'maybe']);
export type AiVerdict = z.infer<typeof AiVerdict>;

export const AiRanked = z.object({
  rank: z.number().int().min(1),
  procurement: ProcurementSummary,
  /** 0 a 100, calculada NO SERVIDOR a partir dos critérios (a IA não inventa o número). */
  score: z.number().int().min(0).max(100),
  verdict: AiVerdict,
  criteria: z.array(z.object({ name: z.string(), status: CriterionStatus })),
  reasons: z.array(z.string()),
  concerns: z.array(z.string()),
  /** Trechos do próprio edital que sustentam a avaliação; `verified=false` quando o trecho não existe no texto. */
  evidence: z.array(z.object({ quote: z.string(), verified: z.boolean() })),
  /** Fontes encontradas na web (Tavily) sobre este edital/órgão. Os links vêm do buscador, nunca da IA. Podem não ser o edital oficial. */
  web_sources: z.array(
    z.object({ title: z.string(), url: z.string(), host: z.string(), snippet: z.string() }),
  ),
});
export type AiRanked = z.infer<typeof AiRanked>;

/** Resultado da busca em si, antes de ser ligado a uma conversa. */
export const AiSearchResult = z.object({
  understood: z.object({
    /** Como a IA entendeu o pedido, em uma frase. */
    summary: z.string(),
    keywords: z.array(z.string()),
    filters: z.array(z.string()),
  }),
  results: z.array(AiRanked),
  /** Oportunidades achadas na web (Tavily) fora da nossa base: links de portais de compras, não verificados. */
  web_opportunities: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      host: z.string(),
      snippet: z.string(),
      /** Avaliação só pelo título e trecho achados: o que não aparece no trecho fica "unknown". Sempre não verificado. */
      score: z.number().int().min(0).max(100),
      verdict: AiVerdict,
      criteria: z.array(z.object({ name: z.string(), status: CriterionStatus })),
      reasons: z.array(z.string()),
      concerns: z.array(z.string()),
      verified: z.literal(false),
    }),
  ),
  /** Vigilâncias fixas (ex.: assessoria jurídica em LGPD): aparecem sempre que há editais abertos, mesmo fora do pedido. */
  watchlist: z.array(
    z.object({ key: z.string(), label: z.string(), items: z.array(ProcurementSummary) }),
  ),
  /** Conclusão curta: qual é a melhor opção e por quê. Vazia quando nada serve. */
  conclusion: z.string(),
  candidates_considered: z.number().int(),
  total_matches: z.number().int(),
  meta: z.object({
    provider: z.string(),
    model: z.string(),
    tokens_in: z.number().int().nullable(),
    tokens_out: z.number().int().nullable(),
    took_ms: z.number().int(),
    /** Conferência na web: ok, skipped (sem chave) ou failed (a avaliação segue sem ela). */
    web_search: z.enum(['ok', 'skipped', 'failed']),
    /** Ex.: 'nl_understanding' quando a IA não entendeu o pedido e a busca usou o texto literal. */
    degraded: z.array(z.string()),
  }),
  disclaimer: z.string(),
  server_now: z.string().datetime(),
});
export type AiSearchResult = z.infer<typeof AiSearchResult>;

/** O que o cliente recebe: o resultado mais a conversa onde ele foi guardado (sempre presente). */
export const AiSearchResponse = AiSearchResult.extend({ conversation_id: z.string().uuid() });
export type AiSearchResponse = z.infer<typeof AiSearchResponse>;
