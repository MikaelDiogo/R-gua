import type { Db } from '@agora/db';
import { collectWindow } from './collect';
import { PncpClient } from './pncp/client';
import { EP_PUBLICACAO, PncpConnector } from './pncp/connector';
import { ALL_MODALITIES } from './pncp/tables';
import { fromPncpDate, toPncpDate } from './pncp/time';
import { recentWindows, registryWindow } from './pncp/windows';
import { maintenance, windowState } from './store';
import type { IngestWindow } from './types';

export type JobLog = (line: string) => void;

interface Base {
  /** Chamadas por minuto ao PNCP (padrão 12 nas cargas agendadas). */
  rate?: number;
  client?: PncpClient;
  now?: () => Date;
  log?: JobLog;
}

export interface JobSummary {
  windows: number;
  skipped: number;
  fetched: number;
  inserted: number;
  updated: number;
  /** Janelas cortadas (limite de páginas/prazo): os registros entram, mas a carga está incompleta. */
  partial: number;
  failed: number;
}

const empty = (): JobSummary => ({
  windows: 0,
  skipped: 0,
  fetched: 0,
  inserted: 0,
  updated: 0,
  partial: 0,
  failed: 0,
});

const label = (w: IngestWindow) =>
  `${w.uf ?? w.municipalityIbge ?? 'BR'} modalidade ${w.modality ?? 'todas'} ${w.start}${w.start === w.end ? '' : `–${w.end}`}`;

/** Roda uma janela, soma no resumo e nunca deixa uma falha (banco, rede) derrubar as demais. */
async function step(
  db: Db,
  connector: PncpConnector,
  w: IngestWindow,
  sum: JobSummary,
  log: JobLog,
  saveRawPages: boolean,
): Promise<void> {
  sum.windows++;
  try {
    const r = await collectWindow(db, connector, w, { saveRawPages });
    sum.fetched += r.fetched;
    sum.inserted += r.stats.inserted;
    sum.updated += r.stats.updated;
    if (r.status === 'ok' && !r.complete) sum.partial++;
    else if (r.status !== 'ok' && r.status !== 'empty') sum.failed++;
    if (r.fetched > 0 || !r.complete) {
      log(
        `${label(w)}: ${r.status}${r.complete ? '' : ' (INCOMPLETA)'} · ${r.pagesFetched}/${r.totalPages ?? '?'} págs · ` +
          `${r.stats.inserted} novos, ${r.stats.updated} atualizados, ${r.stats.unchanged} iguais${r.error ? ` · erro: ${r.error}` : ''}`,
      );
    }
  } catch (e) {
    sum.failed++;
    log(`${label(w)}: FALHOU · ${e instanceof Error ? e.message : String(e)}`);
  }
}

export interface OpenJob extends Base {
  ufs: string[];
  /** Vazio/omitido = TODAS as modalidades numa consulta só (a API aceita omitir). */
  modalities?: number[];
  /** Teto de páginas por consulta (padrão 80, bem acima do que existe: a coleta para quando o PNCP acaba). */
  pages?: number;
}

/** Propostas ABERTAS de cada UF, sem corte. Janela `ok` = todas as páginas vieram. */
export async function runOpen(db: Db, o: OpenJob): Promise<JobSummary> {
  const log = o.log ?? (() => undefined);
  const clock = o.now ?? (() => new Date());
  const client = o.client ?? new PncpClient({ maxCallsPerMinute: o.rate ?? 12 });
  const connector = new PncpConnector({ client, maxPages: o.pages ?? 80, now: clock });
  const sum = empty();
  const mods: Array<number | undefined> = o.modalities?.length ? o.modalities : [undefined];
  for (const uf of o.ufs) {
    for (const modality of mods) {
      const w = connector.openProposalsWindow(
        new Date(clock().getTime() + 365 * 86_400_000),
        modality,
        uf,
      );
      await step(db, connector, w, sum, log, true);
    }
  }
  const m = await maintenance(db);
  log(`manutenção: ${m.closed} encerradas, vocabulário ${m.vocab} termos`);
  return sum;
}

export interface RecentJob extends Base {
  /** Quantos dias de publicação coletar (todas as situações). */
  days: number;
  ufs: string[];
  modalities?: number[];
  /** Largura de cada janela em dias (padrão 7). */
  windowDays?: number;
  /** Não refaz janela já `ok` há menos de tantas horas (padrão 24), exceto a que contém hoje. */
  freshHours?: number;
  /** Guarda o corpo bruto das páginas (padrão não: uma carga histórica encheria o banco gratuito). */
  saveRawPages?: boolean;
}

/** Publicadas nos últimos N dias, de qualquer situação, por semana × UF × modalidade; retomável. */
export async function runRecent(db: Db, o: RecentJob): Promise<JobSummary> {
  const log = o.log ?? (() => undefined);
  const clock = o.now ?? (() => new Date());
  const client = o.client ?? new PncpClient({ maxCallsPerMinute: o.rate ?? 12 });
  const connector = new PncpConnector({ client, maxPages: 200, now: clock });
  const fresh = o.freshHours ?? 24;
  const today = toPncpDate(clock());
  const windows = recentWindows({
    days: o.days,
    ufs: o.ufs,
    ...(o.modalities?.length ? { modalities: o.modalities } : {}),
    ...(o.windowDays ? { windowDays: o.windowDays } : {}),
    now: clock(),
  });
  const sum = empty();
  log(`${windows.length} janelas (${o.days} dias, ${o.ufs.join(',')})`);
  let i = 0;
  for (const w of windows) {
    i++;
    if (w.end !== today) {
      const st = await windowState(db, registryWindow(w)).catch(() => null);
      if (st && st.state === 'ok' && st.ageHours < fresh) {
        sum.skipped++;
        continue;
      }
    }
    await step(db, connector, w, sum, log, o.saveRawPages ?? false);
    if (i % 50 === 0) log(`… ${i}/${windows.length} janelas`);
  }
  const m = await maintenance(db);
  log(`manutenção: ${m.closed} encerradas, vocabulário ${m.vocab} termos`);
  return sum;
}

export interface MunicipalityJob extends Base {
  ibge: string;
  /** Dias de publicação a coletar além das abertas (padrão 180). */
  days?: number;
}

/** UM município: abertas (uma consulta) + publicadas no período, todas as modalidades e situações. */
export async function runMunicipality(db: Db, o: MunicipalityJob): Promise<JobSummary> {
  const log = o.log ?? (() => undefined);
  const clock = o.now ?? (() => new Date());
  const client = o.client ?? new PncpClient({ maxCallsPerMinute: o.rate ?? 20 });
  const connector = new PncpConnector({ client, maxPages: 200, now: clock });
  const today = toPncpDate(clock());
  const start = toPncpDate(
    new Date(fromPncpDate(today).getTime() - ((o.days ?? 180) - 1) * 86_400_000),
  );
  const sum = empty();
  await step(
    db,
    connector,
    connector.openProposalsWindow(
      new Date(clock().getTime() + 365 * 86_400_000),
      undefined,
      undefined,
      o.ibge,
    ),
    sum,
    log,
    false,
  );
  for (const modality of ALL_MODALITIES) {
    await step(
      db,
      connector,
      {
        source: 'pncp',
        endpoint: EP_PUBLICACAO,
        modality,
        municipalityIbge: o.ibge,
        start,
        end: today,
      },
      sum,
      log,
      false,
    );
  }
  const m = await maintenance(db);
  log(`manutenção: ${m.closed} encerradas, vocabulário ${m.vocab} termos`);
  return sum;
}
