import { readable } from '@/lib/format';

const ymd = (iso: string) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
const hhmm = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
const ddmm = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(iso));

/**
 * Data curta e humana ("hoje 09:12", "ontem", "há 3 dias", "19/11"). A comparação usa o relógio do servidor
 * (`server_now`), nunca o do aparelho. Só exibição: nenhum prazo é calculado aqui.
 */
export function relativeDay(iso: string | null, serverNow: string): string {
  if (!iso) return 'Ainda não executou';
  const days = Math.round(
    (new Date(`${ymd(serverNow)}T12:00:00Z`).getTime() -
      new Date(`${ymd(iso)}T12:00:00Z`).getTime()) /
      86_400_000,
  );
  if (days <= 0) return `hoje ${hhmm(iso)}`;
  if (days === 1) return `ontem ${hhmm(iso)}`;
  if (days <= 6) return `há ${days} dias`;
  return ddmm(iso);
}

/** Monitor criado pelo sistema (LGPD). O servidor o recria no próximo login se for excluído. */
export const isFixedMonitor = (name: string) => name.endsWith('(automático)');

/** Nome de exibição: sem o sufixo técnico "(automático)", que vira a etiqueta "Fixo". */
export const monitorTitle = (name: string) => name.replace(/\s*\(automático\)\s*$/, '');

export { readable };
