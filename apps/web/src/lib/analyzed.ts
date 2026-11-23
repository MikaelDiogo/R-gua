'use client';

import { useEffect, useState } from 'react';

const key = (id: string) => `agora.analyzed.${id}`;
const EVENT = 'agora:analyzed';

/** Lembra, neste navegador, que o edital já foi analisado pela IA: só promove o botão "Gerar proposta". */
export function markAnalyzed(id: string) {
  try {
    window.localStorage.setItem(key(id), '1');
  } catch {
    /* armazenamento bloqueado: segue sem lembrar */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
}

export function useAnalyzed(id: string): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    try {
      setDone(window.localStorage.getItem(key(id)) === '1');
    } catch {
      setDone(false);
    }
    const on = (e: Event) => {
      if ((e as CustomEvent<string>).detail === id) setDone(true);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [id]);
  return done;
}
