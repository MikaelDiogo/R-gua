import { z } from 'zod';

export const LegalKind = z.enum(['impugnation', 'appeal', 'counter_arguments']);
export type LegalKind = z.infer<typeof LegalKind>;

export const GenerateLegalPieceRequest = z
  .object({
    procurement_id: z.string().uuid(),
    kind: LegalKind,
    /** O que aconteceu ou o que o edital exige, nas palavras do usuário. */
    facts: z.string().trim().min(10).max(4000),
    /** Cláusula(s) do edital ou ato recorrido, se o usuário quiser apontar. */
    clauses: z.string().trim().max(2000).optional(),
    /** O que o usuário quer obter. */
    objective: z.string().trim().max(1000).optional(),
  })
  .strict();
export type GenerateLegalPieceRequest = z.infer<typeof GenerateLegalPieceRequest>;

/** Fonte achada na web em sites oficiais. Os links vêm do buscador, nunca da IA. */
export const LegalSource = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  host: z.string(),
  snippet: z.string(),
  /** Trecho que a IA usou da fonte e se ele existe mesmo no texto da fonte (conferido pelo servidor). */
  quote: z.string().nullable(),
  quote_verified: z.boolean(),
});
export type LegalSource = z.infer<typeof LegalSource>;

export const LegalSection = z.object({
  key: z.enum(['admissibility', 'facts', 'grounds', 'requests']),
  title: z.string(),
  /** Texto com marcadores [S1] para as fontes e [PREENCHER: …] para o que a IA não tinha como saber. */
  body: z.string(),
});
export type LegalSection = z.infer<typeof LegalSection>;

export const LegalPiece = z.object({
  id: z.string().uuid(),
  procurement_id: z.string().uuid(),
  procurement_object: z.string(),
  organ_name: z.string(),
  kind: LegalKind,
  sections: z.array(LegalSection),
  sources: z.array(LegalSource),
  /** Prazo calculado pelo servidor a partir das datas do edital. Sempre "validar com o jurídico". */
  deadline: z.object({
    label: z.string(),
    due_at: z.string().datetime().nullable(),
    basis: z.string(),
    validate_with_legal: z.literal(true),
  }),
  placeholders: z.array(z.string()),
  warnings: z.array(z.string()),
  version: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  meta: z.object({
    model: z.string(),
    took_ms: z.number().int().nullable(),
    web_search: z.enum(['ok', 'skipped', 'failed']),
  }),
  disclaimer: z.string(),
});
export type LegalPiece = z.infer<typeof LegalPiece>;

export const LegalPieceList = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      procurement_id: z.string().uuid(),
      procurement_object: z.string(),
      organ_name: z.string(),
      kind: LegalKind,
      updated_at: z.string().datetime(),
    }),
  ),
  server_now: z.string().datetime(),
});
export type LegalPieceList = z.infer<typeof LegalPieceList>;

export const UpdateLegalPieceRequest = z
  .object({
    sections: z
      .array(z.object({ key: LegalSection.shape.key, body: z.string().max(30000) }))
      .max(8),
  })
  .strict();
