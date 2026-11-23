import { createPool } from '@agora/db';
import { PncpClient, PncpConnector } from '@agora/ingestion';
import { maintenance, recordWindow, saveRaw, upsertProcurements } from './store';

/**
 * Carga de propostas abertas (docs/05 §5.3). Uso:
 *   node dist/ingest.js open [--pages N] [--modalities 6,8,4] [--rate 12]
 * Pega até N páginas (50 registros) por modalidade, com o rate limit conservador do cliente.
 * Cada janela fica registrada em `ingest_window`; falha nunca vira "vazio".
 */
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? (process.argv[i + 1] as string) : fallback;
}

type Db = ReturnType<typeof createPool>;

interface OpenOptions {
  pages: number;
  modalities: number[];
  ufs: string[];
  rate: number;
}

async function runOpen(db: Db, o: OpenOptions) {
  const client = new PncpClient({ maxCallsPerMinute: o.rate });
  const connector = new PncpConnector({ client, maxPages: o.pages });
  let total = 0;
  for (const uf of o.ufs)
    for (const modality of o.modalities) {
      const w = connector.openProposalsWindow(new Date(Date.now() + 365 * 86400000), modality, uf);
      // Cada estado é uma janela distinta no registro de coleta.
      const wk = { ...w, endpoint: `${w.endpoint}?uf=${uf}` };
      await recordWindow(db, wk, 'running', 0);
      const r = await connector.fetch(w);
      await saveRaw(db, 'pncp', r.raw);
      const stats = await upsertProcurements(db, r.items);
      total += r.items.length;
      // maxPages corta de propósito a coleta: "ok" com páginas restantes é parcial.
      const truncated = r.totalPages !== null && r.pagesFetched < r.totalPages && r.status === 'ok';
      const state =
        r.status === 'ok' && !truncated ? 'ok' : r.status === 'empty' ? 'ok' : 'partial';
      await recordWindow(
        db,
        wk,
        r.status === 'ok' || r.status === 'empty' ? state : 'failed',
        r.items.length,
        r.error,
      );
      console.log(
        `modalidade ${modality} ${uf}: ${r.status}${truncated ? ' (parcial)' : ''} · ${r.pagesFetched}/${r.totalPages ?? '?'} págs · ` +
          `${stats.inserted} novos, ${stats.updated} atualizados, ${stats.unchanged} iguais${r.error ? ` · erro: ${r.error}` : ''}`,
      );
    }
  console.log('manutenção:', await maintenance(db), '· registros lidos:', total);
}

const options = (): OpenOptions => ({
  pages: Number(arg('pages', '8')),
  modalities: arg('modalities', '6,8,4,9,12,7,5').split(',').map(Number),
  // Cobertura do produto: Ceará e Piauí. O PNCP filtra por UF, então a coleta é por estado × modalidade.
  ufs: arg('ufs', process.env.INGEST_UFS ?? 'CE,PI').split(','),
  rate: Number(arg('rate', '12')),
});

/** Servidor: repete a coleta a cada INGEST_INTERVAL_MIN (padrão 360). Falha de uma rodada não derruba o processo. */
async function schedule(db: Db) {
  const everyMin = Math.max(15, Number(process.env.INGEST_INTERVAL_MIN ?? 360));
  let stop = false;
  for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => (stop = true));
  while (!stop) {
    console.log(`[${new Date().toISOString()}] coleta iniciada`);
    try {
      await runOpen(db, options());
    } catch (e) {
      console.error('coleta falhou:', e instanceof Error ? e.message : e);
    }
    for (let waited = 0; waited < everyMin * 60 && !stop; waited += 5)
      await new Promise((r) => setTimeout(r, 5000));
  }
}

async function main() {
  const cmd = process.argv[2];
  const db = createPool('app');
  try {
    if (cmd === 'maintenance') {
      console.log(await maintenance(db));
      return;
    }
    if (cmd === 'schedule') return await schedule(db);
    if (cmd !== 'open') {
      console.error(
        'uso: node dist/ingest.js open|schedule|maintenance [--pages N] [--modalities 6,8] [--ufs CE,PI] [--rate 12]',
      );
      process.exit(2);
    }
    await runOpen(db, options());
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
