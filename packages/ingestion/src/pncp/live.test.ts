import { describe, expect, it } from 'vitest';
import { PncpClient } from './client';
import { PncpConnector } from './connector';
import { detectIgnoredFilter } from './filter-detector';
import { toPncpDate } from './time';

/**
 * Contra a API real do PNCP. Só roda com `PNCP_LIVE=1` (`pnpm --filter @agora/ingestion test:live`):
 * consome o rate limit do órgão, então fica fora do CI normal. Serve de teste de contrato com o mundo real.
 */
describe.skipIf(!process.env.PNCP_LIVE)('PNCP ao vivo', () => {
  const client = new PncpClient({ maxCallsPerMinute: 10 });
  const day = toPncpDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));

  it('uma janela real passa no schema e normaliza', async () => {
    const c = new PncpConnector({ client, pageSize: 10, maxPages: 1 });
    const r = await c.fetch({
      source: 'pncp',
      endpoint: '/v1/contratacoes/publicacao',
      modality: 6,
      start: day,
      end: day,
    });
    expect(['ok', 'empty']).toContain(r.status);
    for (const i of r.items) expect(i.numeroControlePncp).toMatch(/^\d{14}-\d-\d{6}\/\d{4}$/);
  }, 60_000);

  it('filtro por palavra-chave continua ignorado?', async () => {
    const r = await detectIgnoredFilter(client, { start: day, end: day, modality: 6 });
    console.log('detector de filtro:', r);
    expect(['ignored', 'respected', 'inconclusive']).toContain(r.verdict);
  }, 60_000);
});
