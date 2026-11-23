'use client';

import type { ProcurementDetail, ProcurementDocument } from '@agora/contracts';
import { useContext, useState } from 'react';
import { api, problemText } from '@/lib/api';
import { pdfHref, pickEditalDoc } from '@/lib/pdf';
import { Icon } from '../Icon';
import { PdfDocsContext } from './Citations';
import s from './edital.module.css';

/**
 * "Ler PDF do edital": abre o PDF numa nova aba. Com os documentos já coletados é um link comum; sem eles, coleta
 * no PNCP primeiro ("Coletando…") e abre em seguida. A aba é aberta no clique (antes da espera) para o navegador
 * não bloquear a janela.
 */
export function ReadPdfButton({
  procurementId,
  documents,
  className = 'rg-btn',
}: {
  procurementId: string;
  /** Lista já coletada; `null` quando ainda não se sabe (cartões de busca) ou não foi coletada. */
  documents: ProcurementDocument[] | null;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const known = documents ? pickEditalDoc(documents) : null;

  if (documents && documents.length > 0 && known) {
    return (
      <a
        className={className}
        href={pdfHref(procurementId, known.sequence)}
        target="_blank"
        rel="noopener"
      >
        <Icon name="doc" size={14} /> Ler PDF do edital
      </a>
    );
  }

  async function open() {
    setNote(null);
    // Aba aberta já no clique; o endereço entra quando a coleta termina.
    const tab = window.open('', '_blank');
    setBusy(true);
    const r = await api<ProcurementDetail>(`/procurements/${procurementId}/collect`, {
      method: 'POST',
    });
    setBusy(false);
    if (!r.ok) {
      tab?.close();
      const m = problemText(r);
      setNote(`${m.title} ${m.detail}`.trim());
      return;
    }
    const doc = pickEditalDoc(r.data.documents.list);
    if (!doc) {
      tab?.close();
      setNote('O PNCP não tem PDF cadastrado para este edital. Abra pelo portal de origem.');
      return;
    }
    const href = pdfHref(procurementId, doc.sequence);
    if (tab) {
      tab.opener = null;
      tab.location.href = href;
    } else {
      window.location.assign(href);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={open} disabled={busy}>
        <Icon name="doc" size={14} /> {busy ? 'Coletando…' : 'Ler PDF do edital'}
      </button>
      {note ? (
        <span className={s.actionNote} role="alert">
          {note}
        </span>
      ) : null}
    </>
  );
}

/** Versão ligada ao edital em leitura (usa o contexto das citações): para o painel do Leitor de editais. */
export function ReadPdfFromContext() {
  const ctx = useContext(PdfDocsContext);
  if (!ctx) return null;
  return (
    <ReadPdfButton
      procurementId={ctx.procurementId}
      documents={ctx.documents.length > 0 ? ctx.documents : null}
    />
  );
}
