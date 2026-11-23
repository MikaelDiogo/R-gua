/**
 * Entrada de valores em reais no formato brasileiro: ponto separa milhar e vírgula separa centavos.
 * Sem vírgula, "1.234" é milhar (padrão pt-BR) e "12.5" é decimal. Vazio ou inválido vira null.
 */
export function parseBRL(input: string): number | null {
  const s = input.replace(/R\$/gi, '').replace(/[\s ]/g, '').trim();
  if (!s) return null;
  let normalized: string;
  if (s.includes(',')) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    normalized = s.replace(/\./g, '');
  } else {
    normalized = s;
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Número para o campo de texto (sem símbolo): 1234.5 -> "1.234,50". */
export const toInputBRL = (n: number | null | undefined) =>
  n == null
    ? ''
    : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const onlyDigits = (s: string) => s.replace(/\D/g, '');

/** 12345678000195 -> 12.345.678/0001-95 (aceita digitação parcial). */
export function maskCnpj(input: string): string {
  const d = onlyDigits(input).slice(0, 14);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8), d.slice(8, 12), d.slice(12, 14)];
  let out = parts[0] ?? '';
  if (parts[1]) out += `.${parts[1]}`;
  if (parts[2]) out += `.${parts[2]}`;
  if (parts[3]) out += `/${parts[3]}`;
  if (parts[4]) out += `-${parts[4]}`;
  return out;
}

/** Valida os dígitos verificadores do CNPJ. Vazio não é válido (quem chama decide se vazio é permitido). */
export function isValidCnpj(input: string): boolean {
  const d = onlyDigits(input);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    let pos = len - 7;
    for (let i = len; i >= 1; i--) {
      sum += Number(d[len - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}
