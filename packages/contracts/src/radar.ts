import { z } from 'zod';
import { ProcurementSummary } from './procurements';

/** De onde veio um interesse do usuário: uma pergunta feita no chat ou um monitor ativo. */
export const RadarInterest = z
  .object({ label: z.string(), source: z.enum(['chat', 'monitor']) })
  .strict();
export type RadarInterest = z.infer<typeof RadarInterest>;

/** Edital sugerido e o(s) interesse(s) que o explicam ("porque você pesquisou ..."). */
export const RadarForYouItem = z
  .object({ procurement: ProcurementSummary, because: z.array(RadarInterest).min(1).max(3) })
  .strict();
export type RadarForYouItem = z.infer<typeof RadarForYouItem>;

/**
 * "Para você" no Radar: editais abertos que combinam com o que a pessoa pesquisou no chat e vigia nos monitores.
 * Calculado no servidor, só com dados da própria conta (docs/04). `empty` explica a lista vazia.
 */
export const RadarForYouResponse = z
  .object({
    items: z.array(RadarForYouItem),
    interests: z.array(RadarInterest),
    empty: z.enum(['no_interests', 'no_matches']).nullable(),
    server_now: z.string().datetime(),
  })
  .strict();
export type RadarForYouResponse = z.infer<typeof RadarForYouResponse>;
