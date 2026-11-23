import { ErrorCode, ProblemDetails, problem } from '@agora/contracts';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

/** Exceção de domínio: carrega um `code` estável (`08` §2). */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly meta?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Converte qualquer erro em `application/problem+json` (RFC 9457) com `request_id` e sem vazar detalhes internos. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const reply = http.getResponse<FastifyReply>();
    const req = http.getRequest<FastifyRequest>();
    const body = toProblem(exception, String(req.id));
    void reply.status(body.status).header('content-type', 'application/problem+json').send(body);
  }
}

export function toProblem(exception: unknown, requestId: string): ProblemDetails {
  if (exception instanceof DomainError) {
    return problem(exception.code, exception.message, requestId, { meta: exception.meta });
  }
  if (exception instanceof ZodError) {
    return problem('validation_failed', 'Entrada inválida', requestId, {
      meta: {
        issues: exception.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code: ErrorCode =
      status === 401
        ? 'unauthenticated'
        : status === 403
          ? 'forbidden'
          : status === 404
            ? 'not_found'
            : status === 422
              ? 'validation_failed'
              : 'internal_error';
    return { ...problem(code, exception.message, requestId), status };
  }
  // O cliente só vê "Erro interno"; o detalhe fica no log do servidor, ligado ao request_id (sem corpo nem segredos).
  console.error(
    `[${requestId}] erro interno:`,
    exception instanceof Error ? (exception.stack ?? exception.message) : exception,
  );
  return problem('internal_error', 'Erro interno', requestId);
}
