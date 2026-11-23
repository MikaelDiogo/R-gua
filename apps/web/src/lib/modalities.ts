/** Modalidades do PNCP (códigos 1 a 13): tabela de domínio do Manual de Integração, igual à do conector. */
export const MODALITIES: Record<number, string> = {
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
export const modalityLabel = (code: string | number) =>
  MODALITIES[Number(code)] ?? `Modalidade ${code}`;
