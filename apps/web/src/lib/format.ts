// Formatação determinística (mesmo resultado no servidor e no navegador): fuso fixo America/Sao_Paulo.
const TZ = 'America/Sao_Paulo';

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const INT = new Intl.NumberFormat('pt-BR');

/** Valor monetário com 2 casas e separador de milhar. `null` é tratado por quem chama (traço cinza). */
export const fmtBRL = (n: number) => BRL.format(n).replace(/ /g, ' ');
export const fmtInt = (n: number) => INT.format(n);

const parts = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, ...opts }).format(new Date(iso));

export const fmtTime = (iso: string) =>
  parts(iso, { hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtDay = (iso: string) => parts(iso, { day: '2-digit', month: '2-digit' });
export const fmtDate = (iso: string) =>
  parts(iso, { day: '2-digit', month: '2-digit', year: 'numeric' });
export const fmtDateTime = (iso: string) => `${fmtDay(iso)} ${fmtTime(iso)}`;

/** "R$ 1,9 mi", "R$ 245 mil": para somas em cabeçalhos estreitos. O valor exato fica no detalhe. */
export const fmtCompactBRL = (n: number) =>
  n >= 1_000_000
    ? `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
    : n >= 1_000
      ? `R$ ${Math.round(n / 1_000).toLocaleString('pt-BR')} mil`
      : fmtBRL(n);

/** Quantidade com até 4 casas, sem zeros à direita: 12 -> "12", 2.5 -> "2,5". */
export const fmtQty = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

/** Só links http(s) viram href: o endereço vem de fora e nunca pode ser `javascript:` ou `data:`. */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

const STOP = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'e',
  'em',
  'a',
  'o',
  'as',
  'os',
  'para',
  'por',
  'com',
  'na',
  'no',
  'nas',
  'nos',
  'ao',
  'aos',
  'à',
  'às',
  'um',
  'uma',
  'que',
  'ou',
]);

/**
 * Só exibição: edital escrito TODO EM CAIXA ALTA vira frase normal (lê-se melhor). Siglas curtas, números e
 * códigos ficam como vieram. Texto que já tem minúsculas não é mexido; o dado original não muda.
 */
export function readable(text: string): string {
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length < 12) return text;
  const upper = letters.replace(/[^A-ZÀ-Ý]/g, '').length;
  if (upper / letters.length < 0.8) return text;
  const out = text
    .split(/(\s+)/)
    .map((tok) => {
      if (!tok.trim()) return tok;
      const bare = tok.replace(/[^A-Za-zÀ-ÿ0-9/.-]/g, '');
      if (/\d/.test(bare) || bare.includes('/') || bare.length <= 3) {
        return STOP.has(bare.toLowerCase()) ? tok.toLowerCase() : tok;
      }
      return tok.toLowerCase();
    })
    .join('');
  return out
    .replace(/(^|[.!?]\s+)(\p{L})/gu, (_m, p, c) => p + c.toUpperCase())
    .replace(/^\p{L}/u, (c) => c.toUpperCase());
}
