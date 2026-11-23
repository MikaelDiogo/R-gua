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
 * Situação da compra. Revogada, anulada e suspensa vêm do nome (ids 2 em diante nas fixtures: 1=Divulgada, 2=Revogada).
 * "Divulgada" não diz se as propostas ainda estão abertas: isso sai das datas, na normalização.
 */
export function mapStatusFromName(
  name: string,
): Exclude<ProcurementStatus, 'open_for_proposals' | 'in_session' | 'closed'> | 'divulgada' {
  const n = name.toLowerCase();
  if (n.includes('revogad') || n.includes('anulad') || n.includes('cancelad')) return 'canceled';
  if (n.includes('suspens')) return 'suspended';
  if (n.includes('divulgad')) return 'divulgada';
  return 'unknown';
}
