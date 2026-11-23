import type { ConversationDetail, ConversationsResponse } from '@agora/contracts';
import { api, newKey } from './api';

/** Disparado quando uma conversa nasce, muda de nome ou some: a lista "Recentes" da barra lateral se relê. */
export const CONVERSATIONS_EVENT = 'regua:conversas';
export const notifyConversations = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CONVERSATIONS_EVENT));
};

export function listConversations(p: { limit?: number; q?: string; cursor?: string } = {}) {
  const qs = new URLSearchParams();
  if (p.limit) qs.set('limit', String(p.limit));
  if (p.q?.trim()) qs.set('q', p.q.trim());
  if (p.cursor) qs.set('cursor', p.cursor);
  const tail = qs.toString();
  return api<ConversationsResponse>(`/conversations${tail ? `?${tail}` : ''}`);
}

export const getConversation = (id: string) =>
  api<ConversationDetail>(`/conversations/${encodeURIComponent(id)}`);

/** Renomear e excluir levam Idempotency-Key: repetir o mesmo clique não faz duas vezes. */
export const renameConversation = (id: string, title: string) =>
  api<unknown>(`/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { title },
    headers: { 'idempotency-key': newKey() },
  });

export const deleteConversation = (id: string) =>
  api<unknown>(`/conversations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'idempotency-key': newKey() },
  });

const TZ = 'America/Sao_Paulo';
const ymd = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ms));
const dayIndex = (ms: number) => {
  const [y, m, d] = ymd(ms).split('-').map(Number);
  return Math.floor(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
};
const hhmm = (ms: number) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms));
const ddmm = (ms: number) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(
    new Date(ms),
  );

export type DayGroup = 'Hoje' | 'Ontem' | 'Últimos 7 dias' | 'Mais antigos';
export const DAY_GROUPS: DayGroup[] = ['Hoje', 'Ontem', 'Últimos 7 dias', 'Mais antigos'];

/** Grupo por dia civil de Brasília. `now` é o relógio do servidor (a tela ajusta pelo deslocamento medido). */
export function dayGroup(iso: string, now: number): DayGroup {
  const diff = dayIndex(now) - dayIndex(new Date(iso).getTime());
  if (diff <= 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff <= 7) return 'Últimos 7 dias';
  return 'Mais antigos';
}

/** "agora", "há 5 min", "há 3 h", "ontem 14:30", "12/11 09:05". */
export function shortWhen(iso: string, now: number): string {
  const at = new Date(iso).getTime();
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const diff = dayIndex(now) - dayIndex(at);
  if (diff <= 0) return `há ${Math.floor(min / 60)} h`;
  if (diff === 1) return `ontem ${hhmm(at)}`;
  return `${ddmm(at)} ${hhmm(at)}`;
}
