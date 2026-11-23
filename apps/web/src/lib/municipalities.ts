import type { MunicipalitiesResponse } from '@agora/contracts';
import { useEffect, useState } from 'react';

export type Municipality = MunicipalitiesResponse['items'][number];

const KEY = 'regua:municipios:v1';
/** Nomes já vistos (código IBGE → município): a URL guarda só o código, e o chip precisa do nome. */
const known = new Map<string, Municipality>();
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(v))
      for (const m of v)
        if (
          m &&
          typeof m.ibge === 'string' &&
          typeof m.name === 'string' &&
          typeof m.uf === 'string'
        )
          known.set(m.ibge, m as Municipality);
  } catch {
    /* armazenamento bloqueado: os nomes valem só nesta tela */
  }
}

export function rememberMunicipalities(list: readonly Municipality[]) {
  load();
  for (const m of list) known.set(m.ibge, m);
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify([...known.values()].slice(-200)));
  } catch {
    /* sem armazenamento */
  }
}

/** "Crateús (CE)": como o município aparece em chips e filtros. */
export const municipalityLabel = (m: { name: string; uf: string }) => `${m.name} (${m.uf})`;

/**
 * Rótulos dos municípios selecionados na URL (só vem o código). Usa o que o servidor devolveu na busca
 * (`applied`) e o que a pessoa já escolheu no autocomplete; sem nome conhecido, mostra o código.
 */
export function useMunicipalityLabels(
  selected: string[],
  applied: readonly Municipality[] = [],
): Record<string, string> {
  const [, bump] = useState(0);
  useEffect(() => {
    rememberMunicipalities(applied);
    bump((n) => n + 1);
  }, [applied]);
  if (typeof window !== 'undefined') load();
  const out: Record<string, string> = {};
  for (const code of selected) {
    const m = applied.find((a) => a.ibge === code) ?? known.get(code);
    out[code] = m ? municipalityLabel(m) : `Município ${code}`;
  }
  return out;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Tira o nome do município do texto da busca (sem diferenciar acento nem caixa). É o "✕" do chip de município que
 * o servidor achou no texto: sem o nome na frase, a busca deixa de ser limitada àquele lugar.
 */
export function stripPlaceFromText(text: string, name: string): string {
  const target = fold(name);
  if (!target) return text;
  const folded = fold(text);
  const at = folded.indexOf(target);
  if (at < 0) return text;
  // fold() de texto com acento composto mantém o comprimento: o mesmo índice vale no texto original.
  const before = text.slice(0, at).replace(/\b(em|de|do|da|no|na|para|municipio|cidade)\s*$/i, '');
  return `${before}${text.slice(at + target.length)}`.replace(/\s{2,}/g, ' ').trim();
}

/** Busca no portal do PNCP (para conferir lá o que a base do Régua não tem). */
export const pncpPortalUrl = (q: string) =>
  `https://pncp.gov.br/app/editais?q=${encodeURIComponent(q.trim().slice(0, 120))}`;
