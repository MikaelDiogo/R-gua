/** Filtros da busca como vivem na URL (docs/DESIGN §6). A conversão para SearchIntent está em lib/intent.ts. */
export type DeadlineFilter = '' | 'hoje' | '7d' | '30d' | 'data';
export type Sort = 'relevance' | 'deadline_asc' | 'published_desc' | 'value_desc';

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

/** Atalhos de valor (viram valor_min / valor_max na URL). */
export const VALUE_PRESETS = [
  { key: 'ate50', label: 'Até R$ 50 mil', min: null, max: 50_000 },
  { key: '50a500', label: 'R$ 50 mil a R$ 500 mil', min: 50_000, max: 500_000 },
  { key: 'acima500', label: 'Acima de R$ 500 mil', min: 500_000, max: null },
] as const;

export const DEADLINE_OPTIONS: { value: Exclude<DeadlineFilter, ''>; label: string }[] = [
  { value: 'hoje', label: 'Encerra hoje' },
  { value: '7d', label: 'Em até 7 dias' },
  { value: '30d', label: 'Em até 30 dias' },
  { value: 'data', label: 'Escolher datas' },
];

export const SORTS: { value: Sort; label: string }[] = [
  { value: 'relevance', label: 'Relevância' },
  { value: 'deadline_asc', label: 'Prazo mais próximo' },
  { value: 'published_desc', label: 'Publicação mais recente' },
  { value: 'value_desc', label: 'Maior valor' },
];

export const DEADLINES: DeadlineFilter[] = ['hoje', '7d', '30d', 'data'];
