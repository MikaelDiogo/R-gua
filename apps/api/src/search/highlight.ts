import type { HighlightSegment } from '@agora/contracts';

/** Remove acentos caractere a caractere, preservando o comprimento (para casar índices com o texto original). */
export function fold(text: string): string {
  let out = '';
  for (const ch of text) {
    const base = ch.normalize('NFD')[0] ?? ch;
    out += base.length === ch.length ? base : ch;
  }
  return out.toLowerCase();
}

const STOP = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'para',
  'com',
  'por',
  'uma',
  'em',
  'e',
  'a',
  'o',
  'ou',
  'na',
  'no',
]);

/** Termos da consulta em forma simples; aspas e operadores do websearch são ignorados. */
export function queryTerms(q: string | undefined): string[] {
  if (!q) return [];
  return [
    ...new Set(
      fold(q)
        .replace(/(^|\s)-\S+/g, ' ') // termos negados ("-carne") não são procurados nem realçados
        .replace(/["()]/g, ' ')
        .split(/[^a-z0-9/]+/)
        .filter((t) => t.length >= 2 && !STOP.has(t) && t !== 'or' && !t.startsWith('-')),
    ),
  ];
}

/**
 * Segmentos do texto com os termos encontrados marcados. Casa início de palavra (aproxima o stemming do português:
 * "computador" marca "computadores"), sem diferenciar acento nem caixa. Devolve segmentos, nunca HTML (docs/10 §4).
 */
export function highlight(
  text: string,
  q: string | undefined,
  maxLen = 600,
): HighlightSegment[] | null {
  const terms = queryTerms(q);
  if (terms.length === 0) return null;
  const clipped = text.length > maxLen ? text.slice(0, maxLen) : text;
  const folded = fold(clipped);
  const alternation = terms
    .map((t) => {
      const stem = t.length >= 7 ? t.slice(0, t.length - 2) : t;
      return stem.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    })
    .join('|');
  const re = new RegExp(`(?<![a-z0-9])(?:${alternation})[a-z0-9]*`, 'g');

  const segments: HighlightSegment[] = [];
  let last = 0;
  for (const m of folded.matchAll(re)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (start > last) segments.push({ text: clipped.slice(last, start), match: false });
    segments.push({ text: clipped.slice(start, end), match: true });
    last = end;
  }
  if (segments.length === 0) return null;
  if (last < clipped.length) segments.push({ text: clipped.slice(last), match: false });
  if (clipped.length < text.length) segments.push({ text: '…', match: false });
  return segments;
}
