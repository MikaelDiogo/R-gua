'use client';

import type { Citation, ProcurementDocument } from '@agora/contracts';
import { createContext, useContext, useId, useState } from 'react';
import { docForCitation, pdfHref } from '@/lib/pdf';
import s from './edital.module.css';

/** Edital em leitura e seus documentos: permite abrir a citação direto na página do PDF. */
export const PdfDocsContext = createContext<{
  procurementId: string;
  documents: ProcurementDocument[];
} | null>(null);

/** Identifica um trecho citado (o mesmo trecho citado em duas afirmações é um só no painel do documento). */
export const citeKey = (c: Citation) => `${c.document}|${c.page ?? ''}|${c.quote.slice(0, 80)}`;

/**
 * Liga as citações do painel de análise ao painel do documento: clicar em "p. 12" marca o trecho e o documento
 * rola até ele. Fora do leitor (sem provedor) as citações só abrem o trecho no lugar.
 */
export const ReaderContext = createContext<{
  active: string | null;
  focus: (key: string | null) => void;
}>({ active: null, focus: () => {} });

/**
 * Citações de uma afirmação da IA. Cada uma abre o trecho do edital e diz se o servidor conferiu que ele existe,
 * literalmente, na página citada. "Não conferido" é mostrado, nunca escondido.
 */
export function Citations({ items }: { items: Citation[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const reader = useContext(ReaderContext);
  const pdf = useContext(PdfDocsContext);
  const panelId = useId();
  if (items.length === 0) return null;
  const current = open === null ? null : items[open];

  return (
    <div>
      <div className={s.cites}>
        {items.map((c, i) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: lista fixa por render
            key={i}
            type="button"
            className={s.cite}
            data-verified={c.verified}
            aria-expanded={open === i}
            aria-controls={`${panelId}-${i}`}
            onClick={() => {
              const next = open === i ? null : i;
              setOpen(next);
              reader.focus(next === null ? null : citeKey(c));
            }}
          >
            {c.page != null ? `p. ${c.page}` : 'trecho'}
            {c.verified ? null : <span className={s.srOnly}> (não conferido no edital)</span>}
          </button>
        ))}
      </div>
      {current && open !== null ? (
        <div className={s.quote} id={`${panelId}-${open}`}>
          <div className={s.quoteWhere}>
            <span>
              {current.document}
              {current.page != null ? ` · página ${current.page}` : ''}
            </span>
            {current.verified ? (
              <span className="rg-tag rg-tag-success">conferido no edital</span>
            ) : (
              <span
                className="rg-tag rg-tag-warning"
                title="O trecho não foi encontrado no texto da página citada"
              >
                não conferido
              </span>
            )}
          </div>
          <blockquote>{current.quote}</blockquote>
          {pdf && pdf.documents.length > 0
            ? (() => {
                const doc = docForCitation(pdf.documents, current.document);
                return doc ? (
                  <a
                    className="rg-btn"
                    href={pdfHref(pdf.procurementId, doc.sequence, current.page)}
                    target="_blank"
                    rel="noopener"
                  >
                    Abrir no PDF{current.page != null ? ` (página ${current.page})` : ''}
                  </a>
                ) : null;
              })()
            : null}
        </div>
      ) : null}
    </div>
  );
}
