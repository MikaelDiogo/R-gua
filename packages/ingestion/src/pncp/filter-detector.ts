import type { PncpClient } from './client';
import { EP_PUBLICACAO } from './connector';

export type FilterVerdict = 'ignored' | 'respected' | 'inconclusive';

export interface FilterProbeResult {
  verdict: FilterVerdict;
  baselineTotal: number | null;
  filteredTotal: number | null;
  detail: string;
}

/**
 * Detector de filtro ignorado (docs/05 §8). Em 2026-11-03 a API aceita `palavraChave` e o ignora em silêncio,
 * devolvendo o mesmo universo. Chamamos a mesma janela com e sem uma palavra improvável: se o total não mudou,
 * o filtro continua ignorado. Se um dia passar a funcionar, avaliar como otimização, nunca como substituto do índice.
 *
 * `inconclusive` quando qualquer chamada não foi `ok` (429 e erro nunca viram veredito).
 */
export async function detectIgnoredFilter(
  client: PncpClient,
  window: { start: string; end: string; modality: number },
  improbableWord = 'xyzzyqwerty123',
): Promise<FilterProbeResult> {
  const base = {
    dataInicial: window.start,
    dataFinal: window.end,
    codigoModalidadeContratacao: window.modality,
    pagina: 1,
    tamanhoPagina: 10,
  };
  const baseline = await client.get(EP_PUBLICACAO, base);
  const filtered = await client.get(EP_PUBLICACAO, { ...base, palavraChave: improbableWord });

  if (baseline.status !== 'ok' || !baseline.page) {
    return {
      verdict: 'inconclusive',
      baselineTotal: null,
      filteredTotal: null,
      detail: `baseline ${baseline.status} (${baseline.error ?? baseline.httpStatus}); janela sem dados serve de controle`,
    };
  }
  if (filtered.status === 'empty') {
    return {
      verdict: 'respected',
      baselineTotal: baseline.page.totalRegistros,
      filteredTotal: 0,
      detail: 'a palavra improvável zerou o resultado: o filtro parece funcionar',
    };
  }
  if (filtered.status !== 'ok' || !filtered.page) {
    return {
      verdict: 'inconclusive',
      baselineTotal: baseline.page.totalRegistros,
      filteredTotal: null,
      detail: `chamada filtrada ${filtered.status} (${filtered.error ?? filtered.httpStatus})`,
    };
  }
  const same = filtered.page.totalRegistros === baseline.page.totalRegistros;
  return {
    verdict: same ? 'ignored' : 'respected',
    baselineTotal: baseline.page.totalRegistros,
    filteredTotal: filtered.page.totalRegistros,
    detail: same
      ? 'o total não mudou com a palavra improvável: filtro ignorado (comportamento conhecido)'
      : 'o total mudou: o filtro passou a ter efeito',
  };
}
