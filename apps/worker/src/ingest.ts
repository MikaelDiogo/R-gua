import { createPool } from '@agora/db';
import {
  type JobSummary,
  maintenance,
  runMunicipality,
  runOpen,
  runRecent,
  verifyMunicipality,
} from '@agora/ingestion';

/**
 * Coleta do PNCP (docs/05 §5). Uso:
 *   node dist/ingest.js open         [--ufs CE,PI] [--pages 80] [--modalities 6,8] [--rate 12]
 *   node dist/ingest.js recent       --days 14 [--ufs CE,PI] [--modalities 6,8] [--window-days 7] [--fresh-hours 24] [--raw] [--rate 12]
 *   node dist/ingest.js municipality --ibge 2304103 [--days 180] [--rate 20]
 *   node dist/ingest.js verify       --ibge 2304103   (SOMENTE LEITURA: compara PNCP × banco e lista o que falta)
 *   node dist/ingest.js schedule     (laço: open + recent; INGEST_INTERVAL_MIN, INGEST_RECENT_DAYS, INGEST_UFS)
 *   node dist/ingest.js maintenance
 * `open`: propostas abertas, SEM corte (sem --modalities = todas as modalidades numa consulta só).
 * `recent`: publicadas nos últimos N dias, de qualquer situação; retomável (janela `ok` recente não se refaz).
 * `municipality`: abertas + publicadas de UM município (código IBGE).
 * Cada janela fica em `ingest_window`; falha ou corte nunca vira "vazio".
 */
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? (process.argv[i + 1] as string) : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const numbers = (s: string) =>
  s
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

type Db = ReturnType<typeof createPool>;
const log = (line: string) => console.log(line);
const ufs = () => arg('ufs', process.env.INGEST_UFS ?? 'CE,PI').split(',');
const mods = () => (arg('modalities', '') ? numbers(arg('modalities', '')) : undefined);

function report(name: string, s: JobSummary) {
  console.log(
    `${name}: ${s.windows} janelas (${s.skipped} puladas) · ${s.fetched} lidos · ${s.inserted} novos, ${s.updated} atualizados · ` +
      `${s.partial} incompletas, ${s.failed} com falha`,
  );
  // Corte ou falha não passa em silêncio: o job termina com erro para o agendador avisar.
  if (s.failed > 0 || s.partial > 0) process.exitCode = 1;
}

/** Servidor: repete a coleta a cada INGEST_INTERVAL_MIN (padrão 360). Falha de uma rodada não derruba o processo. */
async function schedule(db: Db) {
  const everyMin = Math.max(15, Number(process.env.INGEST_INTERVAL_MIN ?? 360));
  const recentDays = Number(process.env.INGEST_RECENT_DAYS ?? 7);
  let stop = false;
  for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => (stop = true));
  while (!stop) {
    console.log(`[${new Date().toISOString()}] coleta iniciada`);
    try {
      report('open', await runOpen(db, { ufs: ufs(), log }));
      if (recentDays > 0) {
        report('recent', await runRecent(db, { days: recentDays, ufs: ufs(), log }));
      }
    } catch (e) {
      console.error('coleta falhou:', e instanceof Error ? e.message : e);
    }
    process.exitCode = 0; // no laço, o resumo de uma rodada não é o código de saída do processo
    for (let waited = 0; waited < everyMin * 60 && !stop; waited += 5)
      await new Promise((r) => setTimeout(r, 5000));
  }
}

async function main() {
  const cmd = process.argv[2];
  const db = createPool('app');
  try {
    switch (cmd) {
      case 'maintenance':
        console.log(await maintenance(db));
        return;
      case 'schedule':
        return await schedule(db);
      case 'open':
        report(
          'open',
          await runOpen(db, {
            ufs: ufs(),
            pages: Number(arg('pages', '80')),
            rate: Number(arg('rate', '12')),
            ...(mods() ? { modalities: mods() as number[] } : {}),
            log,
          }),
        );
        return;
      case 'recent':
        report(
          'recent',
          await runRecent(db, {
            days: Number(arg('days', '14')),
            ufs: ufs(),
            windowDays: Number(arg('window-days', '7')),
            freshHours: Number(arg('fresh-hours', '24')),
            rate: Number(arg('rate', '12')),
            saveRawPages: flag('raw'),
            ...(mods() ? { modalities: mods() as number[] } : {}),
            log,
          }),
        );
        return;
      case 'verify': {
        const ibge = arg('ibge', '');
        if (!/^d{7}$/.test(ibge)) {
          console.error('informe --ibge com o código IBGE de 7 dígitos (ex.: 2304103 = Crateús)');
          process.exit(2);
        }
        const r = await verifyMunicipality(db, ibge, { crossCheck: !flag('no-cross') });
        console.log(
          `município ${ibge}: PNCP tem ${r.pncp.length} propostas abertas · banco tem ${r.inDb} · faltam ${r.missing.length}` +
            (r.crossCheckMatches === null
              ? ''
              : ` · consulta sem filtro ${r.crossCheckMatches ? 'bate' : 'NÃO bate'} com a soma das modalidades`),
        );
        for (const m of r.missing) {
          console.log(`  FALTA ${m.numeroControlePncp} · ${m.modalityName} · ${m.object}`);
        }
        if (r.incomplete)
          console.log('ATENÇÃO: alguma consulta ao PNCP falhou; o resultado não prova nada.');
        if (r.missing.length > 0 || r.incomplete) process.exitCode = 1;
        return;
      }
      case 'municipality': {
        const ibge = arg('ibge', '');
        if (!/^\d{7}$/.test(ibge)) {
          console.error('informe --ibge com o código IBGE de 7 dígitos (ex.: 2304103 = Crateús)');
          process.exit(2);
        }
        report(
          `município ${ibge}`,
          await runMunicipality(db, {
            ibge,
            days: Number(arg('days', '180')),
            rate: Number(arg('rate', '20')),
            log,
          }),
        );
        return;
      }
      default:
        console.error(
          'uso: node dist/ingest.js open|recent|municipality|schedule|maintenance (veja o cabeçalho de ingest.ts)',
        );
        process.exit(2);
    }
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
