import { z } from 'zod';

/** Códigos de erro de domínio estáveis (`08` §2 e `16` §9). Cliente trata valores desconhecidos como `unknown`. */
export const ErrorCode = z.enum([
  'validation_failed',
  'unauthenticated',
  'forbidden',
  'not_found',
  'plan_required',
  'quota_exceeded',
  'version_conflict',
  'conflict',
  'unsupported_media_type',
  'invalid_transition',
  'idempotency_mismatch',
  'source_unavailable',
  'ai_provider_auth_failed',
  'ai_provider_quota',
  'ai_model_unsupported_task',
  'ai_provider_unavailable',
  'internal_error',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const HTTP_STATUS_BY_CODE: Record<ErrorCode, number> = {
  validation_failed: 422,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  plan_required: 402,
  quota_exceeded: 429,
  version_conflict: 409,
  conflict: 409,
  unsupported_media_type: 415,
  invalid_transition: 409,
  idempotency_mismatch: 422,
  source_unavailable: 503,
  ai_provider_auth_failed: 422,
  ai_provider_quota: 429,
  ai_model_unsupported_task: 422,
  ai_provider_unavailable: 503,
  internal_error: 500,
};

/** `application/problem+json` (RFC 9457) com `code` estável e `request_id`. */
export const ProblemDetails = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  code: z.string(),
  request_id: z.string(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetails>;

export function problem(
  code: ErrorCode,
  title: string,
  requestId: string,
  extra: { detail?: string; meta?: Record<string, unknown> } = {},
): ProblemDetails {
  return {
    type: `https://agora.example/problems/${code}`,
    title,
    status: HTTP_STATUS_BY_CODE[code],
    code,
    request_id: requestId,
    ...extra,
  };
}
