import { describe, expect, it } from 'vitest';
import { fakeFetch, fixture, json, testClient } from './helpers.test-util';

const okPage = () => fixture('publicacao-pregao-eletronico.json');
const params = {
  dataInicial: '20261101',
  dataFinal: '20261102',
  codigoModalidadeContratacao: 6,
  pagina: 1,
  tamanhoPagina: 10,
};

describe('PncpClient: classificação honesta de status', () => {
  it('200 com dados → ok e parseia a página', async () => {
    const { fn } = fakeFetch(() => json(okPage()));
    const { client } = testClient(fn);
    const r = await client.get('/v1/contratacoes/publicacao', params);
    expect(r.status).toBe('ok');
    expect(r.page?.totalRegistros).toBe(31);
  });

  it('204 sem corpo → empty (resposta válida)', async () => {
    const { fn } = fakeFetch(() => new Response(null, { status: 204 }));
    const { client } = testClient(fn);
    expect((await client.get('/x', params)).status).toBe('empty');
  });

  it('429 em HTML nunca vira "nenhum resultado": tenta de novo e termina em rate_limited', async () => {
    const { fn, calls } = fakeFetch(
      () => new Response('<html>Too Many Requests</html>', { status: 429 }),
    );
    const { client, sleeps } = testClient(fn, { maxRetries: 2 });
    const r = await client.get('/x', params);
    expect(r.status).toBe('rate_limited');
    expect(calls).toHaveLength(3);
    expect(typeof r.body).toBe('string');
    expect(sleeps.length).toBeGreaterThanOrEqual(2); // backoff entre as tentativas
  });

  it('respeita Retry-After quando o PNCP informa', async () => {
    let n = 0;
    const { fn } = fakeFetch(() =>
      ++n === 1
        ? new Response('x', { status: 429, headers: { 'retry-after': '7' } })
        : json(okPage()),
    );
    const { client, sleeps } = testClient(fn);
    const r = await client.get('/x', params);
    expect(r.status).toBe('ok');
    expect(sleeps).toContain(7000);
  });

  it('5xx é transitório: repete e se recupera', async () => {
    let n = 0;
    const { fn, calls } = fakeFetch(() =>
      ++n < 3 ? new Response('boom', { status: 503 }) : json(okPage()),
    );
    const { client } = testClient(fn);
    expect((await client.get('/x', params)).status).toBe('ok');
    expect(calls).toHaveLength(3);
  });

  it('4xx de parâmetro (400/422) não repete e devolve a mensagem do PNCP', async () => {
    const { fn, calls } = fakeFetch(() => json(fixture('erro-400-pagina.json'), 400));
    const { client } = testClient(fn);
    const r = await client.get('/x', params);
    expect(r.status).toBe('upstream_error');
    expect(r.error).toContain('Tamanho de página inválido');
    expect(calls).toHaveLength(1);
  });

  it('corpo fora do contrato → schema_mismatch, sem repetir', async () => {
    const { fn, calls } = fakeFetch(() => json({ resultado: [] }));
    const { client } = testClient(fn);
    const r = await client.get('/x', params);
    expect(r.status).toBe('schema_mismatch');
    expect(calls).toHaveLength(1);
  });

  it('200 não-JSON (página de erro em HTML) → schema_mismatch, nunca empty', async () => {
    const { fn } = fakeFetch(() => new Response('<html>manutenção</html>', { status: 200 }));
    const { client } = testClient(fn);
    expect((await client.get('/x', params)).status).toBe('schema_mismatch');
  });

  it('falha de rede e timeout viram upstream_error', async () => {
    const { fn } = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    const { client } = testClient(fn, { maxRetries: 0 });
    const r = await client.get('/x', params);
    expect(r.status).toBe('upstream_error');
    expect(r.error).toContain('network');
  });
});

describe('PncpClient: proteção do PNCP', () => {
  it('espaça as chamadas pelo teto configurado (12/min = 5s)', async () => {
    const { fn } = fakeFetch(() => json(okPage()));
    const { client, sleeps } = testClient(fn, { maxCallsPerMinute: 12 });
    await client.get('/x', params);
    await client.get('/x', params);
    await client.get('/x', params);
    expect(sleeps.filter((s) => s === 5000)).toHaveLength(2); // 1ª sai na hora; 2ª e 3ª esperam 5s
  });

  it('abre o circuit breaker após falhas seguidas e fecha depois do cooldown', async () => {
    let healthy = false;
    const { fn, calls } = fakeFetch(() =>
      healthy ? json(okPage()) : new Response('x', { status: 500 }),
    );
    const { client, advance } = testClient(fn, {
      maxRetries: 0,
      breakerThreshold: 2,
      breakerCooldownMs: 60_000,
    });
    await client.get('/x', params);
    await client.get('/x', params);
    const antes = calls.length;
    const bloqueada = await client.get('/x', params);
    expect(bloqueada).toMatchObject({ status: 'upstream_error', error: 'circuit_open' });
    expect(calls.length).toBe(antes); // não chamou o PNCP
    expect((await client.get('/outro', params)).status).toBe('upstream_error'); // breaker é por endpoint: este chama
    healthy = true;
    advance(61_000);
    expect((await client.get('/x', params)).status).toBe('ok');
  });
});
