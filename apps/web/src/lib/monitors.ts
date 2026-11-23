import type { MonitorIntent } from '@agora/contracts';
import { fmtBRL, fmtDate, fmtDateTime } from './format';
import { modalityLabel } from './modalities';

/** Avisa a barra lateral que a contagem de alertas não lidos mudou (marcou como lido, executou um monitor...). */
export const ALERTS_EVENT = 'agora:alerts-changed';
export function notifyAlertsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ALERTS_EVENT));
}

const compact = (n: number) =>
  n >= 1_000_000
    ? `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
    : n >= 1_000
      ? `R$ ${Math.round(n / 1_000).toLocaleString('pt-BR')} mil`
      : fmtBRL(n);

export function valueText(min?: number, max?: number): string {
  if (min !== undefined && max !== undefined) return `${compact(min)} a ${compact(max)}`;
  if (min !== undefined) return `acima de ${compact(min)}`;
  if (max !== undefined) return `até ${compact(max)}`;
  return '';
}

const cnpjMask = (c: string) =>
  c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c;

/** O que o monitor procura, em pedaços curtos e legíveis ("computadores", "CE e PI", "até R$ 200 mil"...). */
export function intentParts(
  intent: MonitorIntent,
  organNames: Record<string, string> = {},
): string[] {
  const f = intent.filters;
  const out: string[] = [];
  if (intent.q?.trim()) out.push(`“${intent.q.trim().replace(/["“”]/g, '')}”`);
  if (f.uf?.length) out.push(f.uf.join(' e '));
  if (f.organ_cnpj?.length) {
    out.push(
      f.organ_cnpj.length === 1
        ? (organNames[f.organ_cnpj[0] as string] ?? cnpjMask(f.organ_cnpj[0] as string))
        : `${f.organ_cnpj.length} órgãos`,
    );
  }
  if (f.modality?.length) {
    out.push(
      f.modality.length <= 2
        ? f.modality.map((m) => modalityLabel(m)).join(' e ')
        : `${f.modality.length} modalidades`,
    );
  }
  const v = valueText(f.value?.min, f.value?.max);
  if (v) out.push(v);
  const d = f.proposals_deadline;
  if (d?.from || d?.to) {
    out.push(`prazo ${d.from ? fmtDate(d.from) : '…'} a ${d.to ? fmtDate(d.to) : '…'}`);
  }
  if (f.status?.includes('open_for_proposals')) out.push('propostas abertas');
  return out;
}

export const lastRunText = (iso: string | null) =>
  iso ? `Última execução em ${fmtDateTime(iso)}` : 'Ainda não executado';

const BRT = '-03:00';
/** Data civil (yyyy-MM-dd) escolhida pela pessoa → início e fim desse dia em Brasília (ISO). */
export const dayStartIso = (ymd: string) => new Date(`${ymd}T00:00:00${BRT}`).toISOString();
export const dayEndIso = (ymd: string) =>
  new Date(new Date(`${ymd}T00:00:00${BRT}`).getTime() + 86_400_000 - 1000).toISOString();
export const brtYmd = (iso: string) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

/** Nome sugerido a partir das palavras (a pessoa pode trocar). */
export function suggestName(q: string, parts: string[]): string {
  const base = q.trim() || parts[0]?.replace(/[“”]/g, '') || 'Novos editais';
  const name = base.charAt(0).toUpperCase() + base.slice(1);
  return name.length > 60 ? `${name.slice(0, 57)}…` : name;
}

/**
 * Da busca (URL) para o assistente de monitor: leva palavras, UF, órgão, valor, modalidade e datas.
 * Prazos relativos ("em 7 dias") não viram monitor: o monitor roda sempre, então a janela seria fixa e enganosa.
 */
export function monitorHrefFromSearch(sp: {
  get(k: string): string | null;
  getAll(k: string): string[];
}): string {
  const out = new URLSearchParams();
  for (const k of ['q', 'valor_min', 'valor_max', 'de', 'ate']) {
    const v = sp.get(k);
    if (v) out.set(k, v);
  }
  for (const k of ['uf', 'orgao', 'modalidade']) for (const v of sp.getAll(k)) out.append(k, v);
  if (sp.get('abertas') === '0') out.set('abertas', '0');
  const qs = out.toString();
  return qs ? `/monitores/novo?${qs}` : '/monitores/novo';
}
