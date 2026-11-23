import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { UnprocessableEntityException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ProblemFilter } from './platform/problem.filter';
import { registerSecurity } from './platform/security';

export async function createApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      genReqId: (req: { headers: IncomingHttpHeaders }) =>
        (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
      bodyLimit: 1024 * 1024,
      // Atrás do proxy (Caddy → Next), o IP real vem de X-Forwarded-For. Só ligue com TRUST_PROXY=1.
      trustProxy: process.env.TRUST_PROXY === '1',
      // Conexão pendurada não segura recurso: Busca com IA leva até ~60 s.
      requestTimeout: 160_000,
    }),
    { logger: ['error', 'warn', 'log'], bodyParser: false },
  );
  // POST sem corpo com Content-Type JSON (ex.: sair, coletar) é válido: vira {} em vez de erro 400.
  app.useBodyParser(
    'application/json',
    { bodyLimit: 1024 * 1024 },
    (_req: unknown, body: unknown, done: (err: Error | null, v?: unknown) => void) => {
      const text = String(body ?? '').trim();
      try {
        done(null, text ? JSON.parse(text) : {});
      } catch {
        done(
          new UnprocessableEntityException('O corpo da requisição não é um JSON válido.'),
          undefined,
        );
      }
    },
  );
  registerSecurity(app);
  app.useGlobalFilters(new ProblemFilter());
  return app;
}
