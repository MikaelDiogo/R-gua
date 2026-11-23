import type { ProcurementDocument } from '@agora/contracts';
import { safeHref } from '@/lib/format';
import { pdfHref } from '@/lib/pdf';
import { Icon } from '../Icon';
import s from './edital.module.css';

const STATUS: Record<ProcurementDocument['text_status'], { label: string; tag: string }> = {
  ok: { label: 'Texto lido', tag: 'rg-tag rg-tag-success' },
  pending: { label: 'Ainda não lido', tag: 'rg-tag' },
  scanned: {
    label: 'Sem texto: leitura por OCR ainda não disponível',
    tag: 'rg-tag rg-tag-warning',
  },
  too_large: { label: 'Grande demais para ler', tag: 'rg-tag rg-tag-warning' },
  failed: { label: 'Não foi possível ler', tag: 'rg-tag rg-tag-error' },
  unsupported: { label: 'Formato que a Régua não lê', tag: 'rg-tag' },
};

export function DocumentsList({
  docs,
  procurementId,
}: {
  docs: ProcurementDocument[];
  procurementId?: string;
}) {
  if (docs.length === 0) {
    return (
      <div className="rg-empty">
        <div className="rg-empty-head">
          <span>Documentos</span>
          <span className={s.num}>0</span>
        </div>
        <div className="rg-empty-body">
          <p className="rg-empty-title">O PNCP não listou documentos para este edital.</p>
          <p>A coleta funcionou, mas não há arquivos cadastrados. Confira o edital no PNCP.</p>
        </div>
      </div>
    );
  }
  return (
    <ul className={s.docList}>
      {docs.map((d) => {
        const st = STATUS[d.text_status];
        const href = safeHref(d.url);
        return (
          <li key={d.sequence}>
            <Icon name="doc" size={18} />
            <div className={s.docMain}>
              <span className={s.docName}>{d.title}</span>
              <span className={s.docStatus}>
                {d.type}
                {d.pages ? ` · ${d.pages} páginas` : ''}
              </span>
            </div>
            <span className={st.tag}>{st.label}</span>
            {procurementId ? (
              <a
                className="rg-btn"
                href={pdfHref(procurementId, d.sequence)}
                target="_blank"
                rel="noopener"
              >
                Ler PDF
              </a>
            ) : null}
            {href ? (
              <a className="rg-btn" href={href} target="_blank" rel="noopener noreferrer">
                Abrir no PNCP <Icon name="external" size={14} />
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
