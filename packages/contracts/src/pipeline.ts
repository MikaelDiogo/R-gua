import { z } from 'zod';
import { ProcurementSummary } from './procurements';

export const PipelineState = z.enum([
  'descoberto',
  'em_analise',
  'em_preparacao',
  'proposta_enviada',
  'em_disputa',
  'ganho',
  'perdido',
  'desistencia',
  'descartado',
]);
export type PipelineState = z.infer<typeof PipelineState>;

export const PipelineCard = z.object({
  id: z.string().uuid(),
  procurement: ProcurementSummary,
  state: PipelineState,
  assignee: z.string().nullable(),
  notes: z.string().nullable(),
  /** Controle otimista: o `move` exige `If-Match: <version>` (docs/04 §2). */
  version: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type PipelineCard = z.infer<typeof PipelineCard>;

export const PipelineResponse = z.object({
  columns: z.array(z.object({ key: PipelineState, label: z.string() })),
  cards: z.array(PipelineCard),
  server_now: z.string().datetime(),
});
export type PipelineResponse = z.infer<typeof PipelineResponse>;

export const CreateCardCommand = z.object({ procurement_id: z.string().uuid() }).strict();
export const MoveCardCommand = z.object({ to_state: PipelineState }).strict();
export const UpdateCardCommand = z
  .object({
    assignee: z.string().max(120).nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
  })
  .strict();
