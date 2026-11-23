import { type ErrorCode, problem } from '@agora/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const isProduction = () => process.env.NODE_ENV === 'production';

/** Origens aceitas em requisições que alteram dados (docs/04): em produção só a do site; em dev não há bloqueio por origem. */
function allowedOrigins(): string[] {
  return [process.env.APP_ORIGIN, process.env.WEB_ORIGIN]
    .filter((o): o is string => Boolean(o))
    .map((o) => o.replace(/\/$/, ''));
}

/** Limite por IP em memória (janela fixa). Suficiente para um servidor único; troque por Redis se escalar. */
class WindowLimiter {
  private readonly hits = new Map<string, { n: number; resetAt: number }>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Devolve os segundos até liberar quando estourou, senão 0. */
  take(key: string, now = Date.now()): number {
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    }
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= now) {
      this.hits.set(key, { n: 1, resetAt: now + this.windowMs });
      return 0;
    }
    cur.n += 1;
    return cur.n > this.max ? Math.ceil((cur.resetAt - now) / 1000) : 0;
  }
}

/** Hooks do Fastify rodam antes do Nest: a resposta de erro sai daqui, no mesmo formato problem+json. */
function reject(req: FastifyRequest, reply: FastifyReply, code: ErrorCode, message: string) {
  const body = problem(code, message, String(req.id));
  return reply.status(body.status).header('content-type', 'application/problem+json').send(body);
}

const general = new WindowLimiter(600, 60_000);
const loginPerIp = new WindowLimiter(20, 60_000);

/**
 * Camada de segurança HTTP da API (docs/04 §2, §9):
 *  - cabeçalhos defensivos e `no-store` nas respostas (dados de usuário não ficam em cache);
 *  - bloqueio de requisições que alteram dados vindas de outra origem (defesa de CSRF além do SameSite=Lax);
 *  - limite de requisições por IP, mais apertado na entrada.
 */
export function registerSecurity(app: NestFastifyApplication) {
  const fastify = app.getHttpAdapter().getInstance() as unknown as FastifyInstance;

  fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const url = req.url.split('?')[0] ?? '';
    // Verificação de saúde não conta no limite (o orquestrador chama toda hora).
    if (!url.endsWith('/healthz') && !url.endsWith('/health')) {
      const wait = general.take(req.ip);
      if (wait > 0) {
        void reply.header('retry-after', String(wait));
        return reject(req, reply, 'quota_exceeded', 'Muitas requisições. Aguarde um instante.');
      }
      if (url.endsWith('/auth/login')) {
        const w = loginPerIp.take(req.ip);
        if (w > 0) {
          void reply.header('retry-after', String(w));
          return reject(
            req,
            reply,
            'quota_exceeded',
            'Muitas tentativas de entrada. Aguarde um minuto e tente de novo.',
          );
        }
      }
    }

    if (UNSAFE.has(req.method)) {
      const origin = req.headers.origin;
      const site = req.headers['sec-fetch-site'];
      const bad = isProduction()
        ? origin
          ? !allowedOrigins().includes(origin.replace(/\/$/, ''))
          : site === 'cross-site'
        : site === 'cross-site';
      if (bad) return reject(req, reply, 'forbidden', 'Origem da requisição não permitida.');
    }
  });

  fastify.addHook('onSend', async (_req: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    // Cabeçalhos próprios do endpoint (ex.: o PDF do edital, que o navegador precisa poder exibir) têm prioridade.
    const setIfAbsent = (name: string, value: string) => {
      if (!reply.hasHeader(name)) void reply.header(name, value);
    };
    setIfAbsent('x-content-type-options', 'nosniff');
    setIfAbsent('x-frame-options', 'DENY');
    setIfAbsent('referrer-policy', 'no-referrer');
    setIfAbsent('cross-origin-resource-policy', 'same-origin');
    setIfAbsent('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    if (!reply.hasHeader('cache-control')) void reply.header('cache-control', 'no-store');
    return payload;
  });
}
