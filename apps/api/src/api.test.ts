import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ZodError, z } from 'zod';
import { createApp } from './app';
import { DomainError, toProblem } from './platform/problem.filter';

// O pool é preguiçoso: não conecta no teste de saúde.
process.env.DATABASE_URL ??= 'postgres://x:x@localhost:1/x';

let app: NestFastifyApplication;

beforeAll(async () => {
  app = await createApp();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
afterAll(async () => {
  await app.close();
});

describe('API', () => {
  it('GET /v1/health responde ok com server_now', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(Date.parse(body.server_now)).not.toBeNaN();
  });

  it('rota inexistente devolve problem+json 404 com request_id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/nada',
      headers: { 'x-request-id': 'req-123' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({ code: 'not_found', request_id: 'req-123' });
  });
});

describe('toProblem', () => {
  it('DomainError mantém o code', () => {
    const p = toProblem(new DomainError('quota_exceeded', 'Cota esgotada'), 'r1');
    expect(p).toMatchObject({ status: 429, code: 'quota_exceeded', request_id: 'r1' });
  });

  it('ZodError vira validation_failed 422', () => {
    const err = (() => {
      try {
        z.object({ a: z.string() }).strict().parse({ b: 1 });
      } catch (e) {
        return e as ZodError;
      }
      throw new Error('unreachable');
    })();
    expect(toProblem(err, 'r2')).toMatchObject({ status: 422, code: 'validation_failed' });
  });

  it('erro desconhecido não vaza detalhe', () => {
    const p = toProblem(new Error('senha=abc'), 'r3');
    expect(p.code).toBe('internal_error');
    expect(JSON.stringify(p)).not.toContain('senha');
  });
});
