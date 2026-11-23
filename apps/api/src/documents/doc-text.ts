import { unzipSync } from 'fflate';

export interface ExtractedPage {
  /** Arquivo de origem (um ZIP pode ter vários PDFs). */
  label: string;
  page: number;
  text: string;
}

export type ExtractStatus = 'ok' | 'scanned' | 'unsupported' | 'failed' | 'too_large';

export interface Extraction {
  status: ExtractStatus;
  pages: ExtractedPage[];
}

/** Limites contra arquivo malicioso ou enorme (docs/10 §5). */
export const LIMITS = {
  maxPdfPages: 400,
  maxZipEntries: 30,
  maxZipUncompressed: 80 * 1024 * 1024,
  maxZipDepth: 2,
  /** Média mínima de caracteres por página para considerar que o PDF tem texto (senão é digitalizado). */
  minCharsPerPage: 40,
};

export const isPdf = (b: Uint8Array) =>
  b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
const isZip = (b: Uint8Array) =>
  b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05);

/** Texto por página de um PDF. O tipo vem do conteúdo (magic bytes), não da extensão. */
let pdfLock: Promise<unknown> = Promise.resolve();

/**
 * Um PDF por vez: o leitor de PDF usa muita memória e a hospedagem gratuita tem ~512 MB. Duas leituras ao
 * mesmo tempo (dois usuários) derrubariam o processo; em fila, a segunda só espera.
 */
function pdfPages(bytes: Uint8Array, label: string): Promise<Extraction> {
  const run = pdfLock.then(() => pdfPagesNow(bytes, label));
  pdfLock = run.catch(() => undefined);
  return run;
}

async function pdfPagesNow(bytes: Uint8Array, label: string): Promise<Extraction> {
  let destroy: (() => Promise<void>) | undefined;
  try {
    // unpdf é só ESM: carregado sob demanda (e só quando há PDF para ler).
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(bytes);
    // O pdf.js liga destroy/cleanup conforme a versão: usa o que existir (nunca deixa isso derrubar a leitura).
    const p = pdf as { destroy?: () => Promise<void>; cleanup?: () => Promise<void> };
    destroy = async () => {
      await (p.destroy ?? p.cleanup)?.call(p);
    };
    if (pdf.numPages > LIMITS.maxPdfPages) return { status: 'too_large', pages: [] };
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = (text as string[]).map((t, i) => ({
      label,
      page: i + 1,
      text: t
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    }));
    const chars = pages.reduce((s, p) => s + p.text.length, 0);
    if (pages.length === 0 || chars / pages.length < LIMITS.minCharsPerPage) {
      return { status: 'scanned', pages: [] };
    }
    return { status: 'ok', pages };
  } catch {
    return { status: 'failed', pages: [] };
  } finally {
    try {
      await destroy?.(); // devolve a memória do PDF assim que acaba
    } catch {
      // falha ao liberar memória não pode virar erro de leitura
    }
  }
}

/** Extrai texto de PDF ou ZIP (com PDFs dentro, inclusive um ZIP dentro de outro). Outros formatos: `unsupported`. */
export async function extractPages(
  bytes: Uint8Array,
  label: string,
  depth = 0,
): Promise<Extraction> {
  if (isPdf(bytes)) return pdfPages(bytes, label);
  if (!isZip(bytes)) return { status: 'unsupported', pages: [] };
  if (depth >= LIMITS.maxZipDepth) return { status: 'unsupported', pages: [] };

  let files: Record<string, Uint8Array>;
  try {
    let entries = 0;
    let total = 0;
    files = unzipSync(bytes, {
      // O filtro roda antes de descompactar: recusa entrada grande ou excesso de entradas.
      filter: (f) => {
        entries++;
        total += f.originalSize;
        if (entries > LIMITS.maxZipEntries || total > LIMITS.maxZipUncompressed) {
          throw new Error('zip_limits');
        }
        return true;
      },
    });
  } catch (e) {
    return {
      status: e instanceof Error && e.message === 'zip_limits' ? 'too_large' : 'failed',
      pages: [],
    };
  }

  const pages: ExtractedPage[] = [];
  let anyScanned = false;
  let anyUnsupported = false;
  let tooLarge = false;
  for (const [name, content] of Object.entries(files)) {
    if (name.endsWith('/')) continue;
    const r = await extractPages(content, `${label} / ${name.split('/').pop()}`, depth + 1);
    if (r.status === 'ok') pages.push(...r.pages);
    else if (r.status === 'scanned') anyScanned = true;
    else if (r.status === 'too_large') tooLarge = true;
    else anyUnsupported = true;
  }
  if (pages.length > 0) return { status: 'ok', pages };
  if (anyScanned) return { status: 'scanned', pages: [] };
  if (tooLarge) return { status: 'too_large', pages: [] };
  return { status: anyUnsupported ? 'unsupported' : 'failed', pages: [] };
}

/**
 * Primeiro PDF de um arquivo (PDF direto, ou dentro de ZIP, inclusive ZIP dentro de ZIP). O tipo vem do conteúdo,
 * não da extensão, e valem os mesmos limites de extração de `extractPages`. Entradas com "edital" no nome vêm antes.
 */
export function findFirstPdf(bytes: Uint8Array, depth = 0): Uint8Array | null {
  if (isPdf(bytes)) return bytes;
  if (!isZip(bytes) || depth >= LIMITS.maxZipDepth) return null;
  let files: Record<string, Uint8Array>;
  try {
    let entries = 0;
    let total = 0;
    files = unzipSync(bytes, {
      filter: (f) => {
        entries++;
        total += f.originalSize;
        if (entries > LIMITS.maxZipEntries || total > LIMITS.maxZipUncompressed)
          throw new Error('zip_limits');
        return true;
      },
    });
  } catch {
    return null;
  }
  const names = Object.keys(files)
    .filter((n) => !n.endsWith('/'))
    .sort((a, b) => Number(/edital/i.test(b)) - Number(/edital/i.test(a)));
  for (const n of names) {
    const found = findFirstPdf(files[n] as Uint8Array, depth + 1);
    if (found) return found;
  }
  return null;
}
