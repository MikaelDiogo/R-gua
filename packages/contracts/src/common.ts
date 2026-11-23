import { z } from 'zod';

/** Estados cobertos pelo Régua: Ceará e Piauí. */
export const ALLOWED_UFS = ['CE', 'PI'] as const;
export const UF = z.enum(ALLOWED_UFS);
export type UF = z.infer<typeof UF>;

/** Códigos de modalidade do PNCP (1 a 13). Nomes ficam em tabela de domínio versionada. */
export const ModalityCode = z.number().int().min(1).max(13);
export type ModalityCode = z.infer<typeof ModalityCode>;

export const ProcurementStatus = z.enum([
  'open_for_proposals',
  'in_session',
  'closed',
  'canceled',
  'suspended',
  'unknown',
]);
export type ProcurementStatus = z.infer<typeof ProcurementStatus>;

export const Sphere = z.enum(['federal', 'state', 'municipal']);
export type Sphere = z.infer<typeof Sphere>;

export const Role = z.enum(['owner', 'admin', 'member', 'viewer']);
export type Role = z.infer<typeof Role>;

export const Plan = z.enum(['trial', 'basic', 'middle', 'advanced']);
export type Plan = z.infer<typeof Plan>;

/** Resposta paginada por cursor opaco (`08` §1). */
export const pageOf = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), next_cursor: z.string().nullable() });
