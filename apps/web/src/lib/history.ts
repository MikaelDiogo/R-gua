'use client';

import { useCallback, useEffect, useState } from 'react';

// Histórico de busca no navegador (localStorage). Na versão real vive no servidor, por usuário (docs/01 RF-14).
// Todo acesso a localStorage é protegido: pode lançar erro (janela privada, dados bloqueados).
const KEY = 'agora:busca:historico:v1';
const MAX = 20;

export interface HistoryEntry {
  /** Texto buscado. */
  q: string;
  /** Filtros da busca como query string, sem q e sem pagina. */
  qs: string;
  at: number;
  fav: boolean;
}

function read(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const data: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(data)
      ? data.filter(
          (e): e is HistoryEntry =>
            typeof e?.q === 'string' && typeof e?.qs === 'string' && typeof e?.at === 'number',
        )
      : [];
  } catch {
    return [];
  }
}

function write(list: HistoryEntry[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* sem armazenamento: o histórico some ao recarregar, a busca continua funcionando */
  }
}

const same = (a: HistoryEntry, q: string, qs: string) => a.q === q && a.qs === qs;

export function useSearchHistory() {
  const [list, setList] = useState<HistoryEntry[]>([]);
  useEffect(() => setList(read()), []);

  const commit = useCallback((next: HistoryEntry[]) => {
    setList(next);
    write(next);
  }, []);

  return {
    list,
    add(q: string, qs: string) {
      const text = q.trim();
      if (!text && !qs) return;
      const prev = list.find((e) => same(e, text, qs));
      const rest = list.filter((e) => !same(e, text, qs));
      const favs = rest.filter((e) => e.fav);
      const recent = rest.filter((e) => !e.fav).slice(0, MAX - favs.length - 1);
      commit([{ q: text, qs, at: Date.now(), fav: prev?.fav ?? false }, ...recent, ...favs]);
    },
    toggleFav(e: HistoryEntry) {
      commit(list.map((x) => (same(x, e.q, e.qs) ? { ...x, fav: !x.fav } : x)));
    },
    remove(e: HistoryEntry) {
      commit(list.filter((x) => !same(x, e.q, e.qs)));
    },
    /** Limpa as buscas recentes e mantém as favoritas. */
    clear() {
      commit(list.filter((e) => e.fav));
    },
  };
}
