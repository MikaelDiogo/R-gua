import type { Citation } from '@agora/contracts';
import { fold } from '../search/highlight';

/**
 * Conferência de citações contra o texto (docs/09 §4). Fica fora do serviço de análise para a busca com IA também
 * usar (resultados da web) sem criar dependência circular entre os serviços.
 */
export const norm = (s: string) => fold(s).replace(/\s+/g, ' ').trim();

export interface PageIdx {
  label: string;
  page: number;
  text: string;
  norm: string;
}

const words = (t: string) =>
  norm(t)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
const gramsOf = (ws: string[], n = 3): Set<string> => {
  const g = new Set<string>();
  for (let i = 0; i + n <= ws.length; i++) g.add(ws.slice(i, i + n).join(' '));
  return g;
};
const pageGrams = new WeakMap<PageIdx, Set<string>>();
const gramsFor = (p: PageIdx) => {
  const cached = pageGrams.get(p);
  if (cached) return cached;
  const g = gramsOf(words(p.text));
  pageGrams.set(p, g);
  return g;
};
const FUZZY_MIN_WORDS = 6;
const FUZZY_OVERLAP = 0.75;

/**
 * Confere cada citação contra o texto: o trecho precisa existir (literal, ou quase: pontuação e quebra de linha não contam
 * e até 25% de palavras diferentes são toleradas em trechos de 6+ palavras). Se não está na página citada, procura nas
 * outras páginas do mesmo arquivo e corrige a página. Trecho inventado fica "não conferido".
 */
export function verifyCitation(
  c: { document: string; page: number | null; quote: string },
  pages: PageIdx[],
): Citation {
  const quote = c.quote.trim();
  const q = norm(quote);
  const wq = words(quote);
  const same = pages.filter(
    (p) =>
      norm(p.label) === norm(c.document) ||
      norm(p.label).endsWith(norm(c.document)) ||
      norm(c.document).endsWith(norm(p.label)),
  );
  const pool = same.length > 0 ? same : pages;
  const ok = (p: PageIdx): Citation => ({ document: p.label, page: p.page, quote, verified: true });

  if (q.length >= 12) {
    const flat = wq.join(' ');
    const exact = pool.find(
      (p) => p.page === c.page && (p.norm.includes(q) || words(p.text).join(' ').includes(flat)),
    );
    const hit =
      exact ?? pool.find((p) => p.norm.includes(q) || words(p.text).join(' ').includes(flat));
    if (hit) return ok(hit);
  }
  if (wq.length >= FUZZY_MIN_WORDS) {
    const qg = gramsOf(wq);
    if (qg.size > 0) {
      let best: { p: PageIdx; score: number } | null = null;
      for (const p of pool) {
        const pg = gramsFor(p);
        let n = 0;
        for (const g of qg) if (pg.has(g)) n++;
        const score = n / qg.size;
        if (
          score >= FUZZY_OVERLAP &&
          (!best || score > best.score || (score === best.score && p.page === c.page))
        )
          best = { p, score };
      }
      if (best) return ok(best.p);
    }
  }
  return { document: c.document, page: c.page, quote, verified: false };
}
