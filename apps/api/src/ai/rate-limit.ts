import { DomainError } from '../platform/problem.filter';

/** Limite simples em memória enquanto não há cota por plano (docs/01 §5): protege o custo da IA no modo dev. */
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 30;
const hits: number[] = [];

export function checkAiQuota(): void {
  const now = Date.now();
  while (hits.length && (hits[0] as number) < now - WINDOW_MS) hits.shift();
  if (hits.length >= MAX_PER_WINDOW) {
    throw new DomainError(
      'quota_exceeded',
      'Muitas chamadas de IA em pouco tempo. Aguarde alguns minutos.',
    );
  }
  hits.push(now);
}
