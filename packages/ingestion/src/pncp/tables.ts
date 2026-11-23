import type { ProcurementStatus, Sphere } from '@agora/contracts';

/** Modalidades de contratação do PNCP (1 a 13; Manual de Integração). Os ids 4, 6 e 12 foram confirmados nas respostas reais. */
export const PNCP_MODALITIES: Record<number, string> = {
  1: 'Leilão - Eletrônico',
  2: 'Diálogo Competitivo',
  3: 'Concurso',
  4: 'Concorrência - Eletrônica',
  5: 'Concorrência - Presencial',
  6: 'Pregão - Eletrônico',
  7: 'Pregão - Presencial',
  8: 'Dispensa de Licitação',
  9: 'Inexigibilidade',
  10: 'Manifestação de Interesse',
  11: 'Pré-qualificação',
  12: 'Credenciamento',
  13: 'Leilão - Presencial',
};

export const ALL_MODALITIES = Object.keys(PNCP_MODALITIES).map(Number);

/** `esferaId` do PNCP. Valores vistos nas respostas: F, E, M e N (não se aplica). Desconhecido vira null. */
export function mapSphere(esferaId: string | null | undefined): Sphere | null {
  switch ((esferaId ?? '').toUpperCase()) {
    case 'F':
      return 'federal';
    case 'E':
    case 'D': // distrital tratado como estadual
      return 'state';
    case 'M':
      return 'municipal';
    default:
      return null;
  }
}

/**
 * Situação da compra → enum do contrato (ProcurementStatus). Mapa:
 *   "Divulgada no PNCP"          → 'divulgada' (a normalização decide pelas datas: propostas abertas = open_for_proposals,
 *                                   prazo vencido = closed, sem prazo = unknown)
 *   Revogada / Anulada / Cancelada → canceled
 *   Suspensa                      → suspended
 *   Homologada / Encerrada / Concluída / Fracassada / Deserta / Adjudicada → closed
 *   Em julgamento / Em disputa    → in_session
 *   qualquer outro texto          → unknown (nunca é chutado)
 * Observação: nas respostas de consulta do PNCP a compra só tem as situações Divulgada, Revogada, Anulada e Suspensa;
 * "encerrada" e "homologada" aparecem pelas datas (e por valorTotalHomologado), então o 'closed' vem da normalização.
 * As entradas extras abaixo são defensivas: se o PNCP passar a mandar o nome, o mapa já cobre sem inventar valor novo.
 */
export function mapStatusFromName(
  name: string,
): Exclude<ProcurementStatus, 'open_for_proposals'> | 'divulgada' {
  const n = name.toLowerCase();
  if (n.includes('revogad') || n.includes('anulad') || n.includes('cancelad')) return 'canceled';
  if (n.includes('suspens')) return 'suspended';
  if (/homologad|encerrad|conclu[ií]d|fracassad|desert|adjudicad/.test(n)) return 'closed';
  if (n.includes('julgament') || n.includes('em disputa')) return 'in_session';
  if (n.includes('divulgad')) return 'divulgada';
  return 'unknown';
}
