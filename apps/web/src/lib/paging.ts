'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export const PAGE_SIZES = [20, 50] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

interface Keys {
  page: string;
  size: string;
}

/**
 * Estado de paginação na URL (?pagina=2&por_pagina=50) para voltar e compartilhar.

 */
export function usePaging(keys: Keys = { page: 'pagina', size: 'por_pagina' }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const rawSize = Number(sp.get(keys.size));
  const perPage: PageSize = PAGE_SIZES.find((s) => s === rawSize) ?? PAGE_SIZES[0];
  const rawPage = Number(sp.get(keys.page));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  const write = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return {
    page,
    perPage,
    setPage: (n: number) => write({ [keys.page]: n <= 1 ? null : String(n) }),
    setPerPage: (n: number) =>
      write({ [keys.size]: n === PAGE_SIZES[0] ? null : String(n), [keys.page]: null }),
    resetPage: () => {
      if (page > 1) write({ [keys.page]: null });
    },
  };
}

/** Recorta a página pedida e corrige página fora do intervalo. */
export function slicePage<T>(items: T[], page: number, perPage: number) {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(page, pages);
  const start = (current - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    page: current,
    pages,
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(start + perPage, items.length),
  };
}
