import type { ProcurementDocument } from '@agora/contracts';

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** O servidor entrega o arquivo inline (docs/08); o navegador abre no leitor de PDF. `page` vira `#page=N`. */
export const pdfHref = (procurementId: string, sequence: number, page?: number | null): string =>
  `/api/procurements/${encodeURIComponent(procurementId)}/documents/${sequence}/file${
    page != null && page > 0 ? `#page=${page}` : ''
  }`;

/** Prefere o documento do tipo "edital"; sem ele, o primeiro PDF da lista; sem PDF, o primeiro documento. */
export function pickEditalDoc(docs: ProcurementDocument[]): ProcurementDocument | null {
  const isPdf = (d: ProcurementDocument) => /pdf/.test(plain(`${d.type} ${d.title} ${d.url}`));
  return (
    docs.find((d) => plain(`${d.type} ${d.title}`).includes('edital') && isPdf(d)) ??
    docs.find((d) => plain(`${d.type} ${d.title}`).includes('edital')) ??
    docs.find(isPdf) ??
    docs[0] ??
    null
  );
}

/** Documento citado pela IA: casa pelo título; se não achar, cai no edital principal. */
export function docForCitation(
  docs: ProcurementDocument[],
  title: string,
): ProcurementDocument | null {
  const t = plain(title).trim();
  return docs.find((d) => plain(d.title).trim() === t) ?? pickEditalDoc(docs);
}
