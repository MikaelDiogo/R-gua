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
  /** 'help' = o chat respondeu uma dúvida sobre o sistema (sem buscar editais); 'search' = busca de editais. */
  kind: z.enum(['search', 'help']).default('search'),
  /** Resposta de ajuda (só quando kind = 'help'): texto curto em português e perguntas de continuação. */
  help: z
    .object({ answer: z.string(), suggestions: z.array(z.string()).max(5) })
    .nullable()
    .default(null),
  understood: z.object({
    /** Como a IA entendeu o pedido, em uma frase. */
    summary: z.string(),
    keywords: z.array(z.string()),
    filters: z.array(z.string()),
    /** Municípios que o servidor identificou no pedido (sem IA): o resultado só vem deles. */
    municipality: z
      .array(z.object({ name: z.string(), ibge: z.string(), uf: z.string() }))
      .default([]),
    /** Consulta ao PNCP na hora, para o município pedido (null = não foi preciso ou não está ligada). */
    live_refresh: z
      .object({ fetched: z.number().int(), upserted: z.number().int(), complete: z.boolean() })
      .nullable()
      .default(null),
  }),
  results: z.array(AiRanked),
  /** Oportunidades achadas na web (Tavily) fora da nossa base: links de portais de compras, não verificados. */
  web_opportunities: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      host: z.string(),
      snippet: z.string(),
      /** Nota calculada no servidor. Com `extracted` = true vem do conteúdo da página; senão só do título e trecho. */
      score: z.number().int().min(0).max(100),
      verdict: AiVerdict,
      criteria: z.array(
        z.object({
          name: z.string(),
          status: CriterionStatus,
          /** Trecho do conteúdo da página que sustenta o critério, conferido pelo servidor; null sem prova. */
          quote: z.string().nullable().default(null),
        }),
      ),
      reasons: z.array(z.string()),
      concerns: z.array(z.string()),
      /** true só quando o servidor conferiu pelo menos uma citação literal no conteúdo da página. */
      verified: z.boolean(),
      /** A página é mesmo um edital ou aviso de contratação? null = não deu para ler o conteúdo. */
      is_edital: z.boolean().nullable().default(null),
      /** O conteúdo da página foi lido (extraído) para a análise? Senão a avaliação usou só título e trecho. */
      extracted: z.boolean().default(false),
      /** O que a página diz do próprio edital (objeto, órgão, local, valor, prazo), quando foi possível ler. */
      details: z
        .object({
          object: z.string().nullable(),
          organ: z.string().nullable(),
          place: z.string().nullable(),
          value: z.string().nullable(),
          deadline: z.string().nullable(),
        })
        .nullable()
        .default(null),
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
