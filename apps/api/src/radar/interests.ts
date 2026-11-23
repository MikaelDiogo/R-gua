import { MonitorIntent, type RadarInterest, type SearchIntent } from '@agora/contracts';
import { extractPlace } from '@agora/domain';

/** Quantos interesses entram no Radar e o tamanho máximo do rótulo (docs/01: o Radar responde "o que chegou que vale disputar?"). */
export const MAX_INTERESTS = 6;
const MAX_KEYWORDS = 6;
const MAX_LABEL = 80;

/** Linha do histórico do chat, já reduzida no SQL ao que importa (a resposta inteira pode ter 2 MB). */
export interface ChatRow {
  conversation_id: string;
  role: 'user' | 'assistant';
  prompt: string | null;
  kind: string | null;
  keywords: unknown;
  municipality: unknown;
  created_at: Date;
}

export interface MonitorRow {
  name: string;
  intent: unknown;
  updated_at: Date;
}

/** Um interesse: o que a pessoa procura, com o lugar como FILTRO (nunca como texto) e de onde veio. */
export interface Interest extends RadarInterest {
  key: string;
  /** Quando foi feita a pergunta ou o monitor foi alterado (mais recente primeiro). */
  at: number;
  /** Texto de busca já no formato do índice (`"material de limpeza" or papel`); vazio = só o lugar. */
  q: string | undefined;
  filters: SearchIntent['filters'];
}

const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const strings = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];

/** Mesmo formato da busca por IA: termos entre aspas quando têm espaço, ligados por "or". */
export function toQuery(keywords: string[]): string {
  const terms = keywords
    .map((k) =>
      k
        .replace(/["'()-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((k) => k.length >= 2);
  return [...new Set(terms)].map((t) => (t.includes(' ') ? `"${t}"` : t)).join(' or ');
}

/** Dois interesses iguais (mesmo texto, mesmo lugar, mesmos filtros) viram um só. */
function keyOf(q: string | undefined, filters: SearchIntent['filters']): string {
  const sorted = (a?: readonly (string | number)[]) => [...(a ?? [])].map(String).sort();
  return JSON.stringify({
    q: fold(q ?? ''),
    ibge: sorted(filters.municipality_ibge),
    uf: sorted(filters.uf),
    modality: sorted(filters.modality),
    value: filters.value ?? null,
  });
}

const clip = (s: string) => (s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL - 1).trimEnd()}…` : s);

function muniNames(v: unknown): Array<{ name: string; ibge: string }> {
  if (!Array.isArray(v)) return [];
  const out: Array<{ name: string; ibge: string }> = [];
  for (const m of v) {
    if (m && typeof m === 'object' && 'ibge' in m && 'name' in m) {
      const { ibge, name } = m as { ibge: unknown; name: unknown };
      if (typeof ibge === 'string' && typeof name === 'string') out.push({ ibge, name });
    }
  }
  return out;
}

/**
 * Interesse de UMA pergunta do chat. O lugar é lido pelo servidor, sem IA (mesma regra da busca): município vira
 * filtro e nunca texto, e cidade de fora de CE/PI descarta o interesse (não dá para vigiar o que o Régua não cobre).
 */
export function chatInterest(
  prompt: string,
  saved: { keywords: unknown; municipality: unknown },
  at: number,
): Interest | null {
  const place = extractPlace(prompt);
  if (place.outside.length > 0 && place.municipalities.length === 0) return null;
  const places = new Map<string, string>();
  for (const m of place.municipalities) places.set(m.ibge, m.name);
  for (const m of muniNames(saved.municipality))
    if (!places.has(m.ibge)) places.set(m.ibge, m.name);
  const ibges = [...places.keys()];
  const keywords = strings(saved.keywords).slice(0, MAX_KEYWORDS);
  if (keywords.length === 0 && ibges.length === 0) return null;

  const filters: SearchIntent['filters'] = ibges.length ? { municipality_ibge: ibges } : {};
  const q = keywords.length ? toQuery(keywords) || undefined : undefined;
  const what = keywords.length ? keywords.slice(0, 3).join(', ') : 'licitações';
  const where = ibges.length ? ` em ${[...places.values()].join(' e ')}` : '';
  return {
    key: keyOf(q, filters),
    label: clip(`${what}${where}`),
    source: 'chat',
    at,
    q,
    filters,
  };
}

/**
 * Interesses do histórico: cada pergunta do usuário é pareada com a resposta seguinte da mesma conversa. Dúvida sobre
 * o sistema (kind = 'help') não é interesse; pergunta sem resposta gravada (busca cancelada ou falha) também não.
 */
export function chatInterests(rows: ChatRow[]): Interest[] {
  const sorted = [...rows].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  const pending = new Map<string, { prompt: string; at: number }>();
  const out: Interest[] = [];
  for (const r of sorted) {
    if (r.role === 'user' && r.prompt) {
      pending.set(r.conversation_id, { prompt: r.prompt, at: r.created_at.getTime() });
    } else if (r.role === 'assistant') {
      const p = pending.get(r.conversation_id);
      pending.delete(r.conversation_id);
      if (!p || r.kind === 'help') continue;
      const i = chatInterest(p.prompt, r, p.at);
      if (i) out.push(i);
    }
  }
  return out;
}

/** Interesse de um monitor ATIVO: o que ele vigia, com os filtros dele (lugar, valor, modalidade) como estão. */
export function monitorInterest(row: MonitorRow): Interest | null {
  const parsed = MonitorIntent.safeParse(row.intent);
  if (!parsed.success) return null;
  const { q, filters } = parsed.data;
  const text = q?.trim() || undefined;
  if (!text && !filters.municipality_ibge?.length && !filters.uf?.length) return null;
  return {
    key: keyOf(text, filters),
    label: clip(row.name.trim() || 'Monitor'),
    source: 'monitor',
    at: row.updated_at.getTime(),
    q: text,
    filters,
  };
}

/** Junta chat e monitores: mais recentes primeiro, sem repetir, no máximo MAX_INTERESTS. */
export function buildInterests(chat: ChatRow[], monitors: MonitorRow[]): Interest[] {
  const all = [
    ...chatInterests(chat),
    ...monitors.map(monitorInterest).filter((i): i is Interest => i !== null),
  ].sort((a, b) => b.at - a.at);
  const seen = new Set<string>();
  const out: Interest[] = [];
  for (const i of all) {
    if (seen.has(i.key)) continue;
    seen.add(i.key);
    out.push(i);
    if (out.length === MAX_INTERESTS) break;
  }
  return out;
}
