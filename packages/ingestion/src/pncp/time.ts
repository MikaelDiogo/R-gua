/**
 * O PNCP devolve datas SEM fuso ("2026-11-01T02:14:33"). Pela hora do servidor deles (cabeçalho de erro com -03:00)
 * elas estão em America/Sao_Paulo. O Brasil não tem horário de verão desde 2019, então o deslocamento é fixo em -03:00.
 */
const BRT_OFFSET = '-03:00';

export function brtToUtcIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  const d = new Date(hasZone ? value : `${value}${BRT_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** yyyyMMdd a partir de uma data (usa o dia civil em UTC-3, o mesmo do PNCP). */
export function toPncpDate(d: Date): string {
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  const y = brt.getUTCFullYear();
  const m = String(brt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(brt.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export function fromPncpDate(s: string): Date {
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00${BRT_OFFSET}`);
}
