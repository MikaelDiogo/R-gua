import { type ApiResult, problemText } from './api';

export interface AiFailure {
  title: string;
  detail: string;
  /** Vale a pena oferecer "Tentar de novo" (falhas temporárias), em vez de pedir que a pessoa mude o texto. */
  retryable: boolean;
}

/** Tempo máximo de espera da Busca com IA. Com a chave gratuita do Gemini a chamada leva de 30 a 100 s; o proxy e a API aceitam até 150 s. */
export const AI_TIMEOUT_MS = 150_000;

export const AI_TIMEOUT_FAILURE: AiFailure = {
  title: 'A IA demorou mais do que o esperado.',
  detail:
    'Passou de 2 minutos e meio sem resposta. Tente de novo, de preferência com um pedido mais curto.',
  retryable: true,
};

/**
 * Mensagens claras por `code` do problema (docs/08 §2 e docs/16 §9). Só falas do servidor que o usuário
 * consegue agir sobre; o resto cai no texto genérico, que nunca finge "nenhum resultado".
 */
export function aiFailure(r: Extract<ApiResult<unknown>, { ok: false }>): AiFailure {
  const code = r.problem?.code;
  switch (code) {
    case 'validation_failed':
      return {
        title: 'Não consegui usar esse pedido.',
        detail:
          r.problem?.detail ||
          'Escreva de 3 a 600 caracteres descrevendo o que você procura, por exemplo o objeto, a região e a faixa de valor.',
        retryable: false,
      };
    case 'quota_exceeded':
      return {
        title: 'Você chegou ao limite de pesquisas com IA por enquanto.',
        detail:
          r.problem?.detail ||
          'Aguarde alguns minutos e tente de novo. A busca por palavras continua disponível.',
        retryable: true,
      };
    case 'ai_provider_unavailable':
      return {
        title: 'A IA está indisponível agora.',
        detail:
          'O serviço de IA não respondeu. Isso não quer dizer que não existam editais para o seu pedido. Tente de novo em instantes ou use a busca por palavras.',
        retryable: true,
      };
    case 'ai_provider_auth_failed':
      return {
        title: 'A chave da IA não está funcionando.',
        detail:
          'Avise quem administra a Régua para conferir a configuração da IA. A busca por palavras continua disponível.',
        retryable: false,
      };
    case 'ai_model_unsupported_task':
      return {
        title: 'O modelo de IA configurado não consegue fazer esta tarefa.',
        detail: 'Quem administra a Régua precisa escolher outro modelo em Configurações.',
        retryable: false,
      };
    default: {
      const m = problemText(r);
      return { title: m.title, detail: m.detail, retryable: r.unreachable || r.status >= 500 };
    }
  }
}
