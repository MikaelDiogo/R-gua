import type { SearchResponse } from '@agora/contracts';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SearchView } from '@/components/SearchView';
import { api, problemText } from '@/lib/api';
import { readFilters, toIntent } from '@/lib/intent';
import '@/styles/regua.css';

export const metadata: Metadata = { title: 'Buscador · Régua' };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function BuscaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  // "Perguntar à IA" agora é a tela /chat; links antigos (?modo=ia) levam para lá com o texto.
  if (first(sp.modo) === 'ia')
    redirect(first(sp.q) ? `/chat?q=${encodeURIComponent(first(sp.q))}` : '/chat');

  const filters = readFilters(sp);
  const r = await api<SearchResponse>('/search', { method: 'POST', body: toIntent(filters) });
  return <SearchView data={r.ok ? r.data : null} error={r.ok ? null : problemText(r)} />;
}
