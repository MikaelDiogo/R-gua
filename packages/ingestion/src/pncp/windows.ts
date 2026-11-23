import type { IngestWindow } from '../types';
import { EP_PUBLICACAO } from './connector';
import { ALL_MODALITIES } from './tables';
import { fromPncpDate, toPncpDate } from './time';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RecentWindowsOptions {
  /** Quantos dias para trás, contando hoje (dia civil de Brasília). */
  days: number;
  /** Largura de cada janela em dias (padrão 7: o PNCP recomenda 1 a 7 dias por consulta de publicação). */
  windowDays?: number;
  ufs: string[];
  /** Padrão: as 13 modalidades (a consulta por publicação exige uma modalidade por chamada). */
  modalities?: number[];
  now?: Date;
}

/**
 * Janelas por data de PUBLICAÇÃO, da mais recente para a mais antiga, cobrindo `days` dias sem buracos nem
 * sobreposição. Para cada semana: UF × modalidade. Todas as situações entram (abertas, encerradas, suspensas…).
 */
export function recentWindows(opts: RecentWindowsOptions): IngestWindow[] {
  const windowDays = Math.max(1, opts.windowDays ?? 7);
  const modalities = opts.modalities ?? ALL_MODALITIES;
  const today = fromPncpDate(toPncpDate(opts.now ?? new Date())).getTime();
  const since = today - (Math.max(1, opts.days) - 1) * DAY_MS;
  const out: IngestWindow[] = [];
  for (let end = today; end >= since; end -= windowDays * DAY_MS) {
    const start = Math.max(since, end - (windowDays - 1) * DAY_MS);
    for (const uf of opts.ufs) {
      for (const modality of modalities) {
        out.push({
          source: 'pncp',
          endpoint: EP_PUBLICACAO,
          modality,
          uf,
          start: toPncpDate(new Date(start)),
          end: toPncpDate(new Date(end)),
        });
      }
    }
  }
  return out;
}

/**
 * Chave de registro em `ingest_window`: a tabela não tem coluna de UF nem de município, então eles entram no
 * endpoint (`/v1/contratacoes/publicacao?uf=CE`), como a carga de abertas já fazia.
 */
export function registryWindow(w: IngestWindow): IngestWindow {
  const extra = [w.uf ? `uf=${w.uf}` : '', w.municipalityIbge ? `ibge=${w.municipalityIbge}` : '']
    .filter(Boolean)
    .join('&');
  return extra ? { ...w, endpoint: `${w.endpoint}?${extra}` } : w;
}
