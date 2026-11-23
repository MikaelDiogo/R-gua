import { type AiFailure, aiFailure } from './ai-errors';
import type { ApiResult } from './api';

export type Failure = AiFailure & { code?: string };

/**
 * Mensagem por `code` do problema (docs/08 §2) para telas que não são só a Busca com IA.
 * Nunca finge "nada encontrado": falha é falha e mostra o que o servidor disse.
 */
export function failureOf(r: Extract<ApiResult<unknown>, { ok: false }>): Failure {
  const code = r.problem?.code;
  switch (code) {
    case 'validation_failed':
      return {
        code,
        title: 'Confira os dados informados.',
        detail: r.problem?.detail ?? '',
        retryable: false,
      };
    case 'not_found':
      return {
        code,
        title: 'Não encontrei isto no servidor.',
        detail: r.problem?.detail ?? 'O item pode ter sido removido ou o link está incorreto.',
        retryable: false,
      };
    case 'version_conflict':
      return {
        code,
        title: 'Outra pessoa alterou este item.',
        detail: 'Recarreguei a versão atual do servidor. Confira antes de salvar de novo.',
        retryable: false,
      };
    case 'source_unavailable':
      return {
        code,
        title: 'O PNCP não respondeu agora.',
        detail:
          'Isso não quer dizer que o edital não tenha itens ou documentos. Tente de novo em instantes.',
        retryable: true,
      };
    default:
      return { code, ...aiFailure(r) };
  }
}
