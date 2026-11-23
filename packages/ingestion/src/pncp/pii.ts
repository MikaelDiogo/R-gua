/**
 * LGPD na ingestão (docs/05 §10): CPF em texto livre é mascarado ANTES de indexar ou gerar embedding.
 * Só mascara quando há contexto de CPF (formato com pontuação, ou rótulo "CPF"): números de 11 dígitos
 * sem contexto aparecem em objetos reais (ex.: número de emenda parlamentar) e não são CPF.
 */
const CPF_FORMATTED = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const CPF_LABELLED = /(\bCPF\b[^0-9]{0,15})(\d{11})\b/gi;

export const CPF_MASK = '[CPF omitido]';

export function maskPii(text: string): { text: string; masked: boolean } {
  let masked = false;
  let out = text.replace(CPF_FORMATTED, () => {
    masked = true;
    return CPF_MASK;
  });
  out = out.replace(CPF_LABELLED, (_m, label: string) => {
    masked = true;
    return `${label}${CPF_MASK}`;
  });
  return { text: out, masked };
}
