import '@/styles/work.css';
import type { LegalPieceList } from '@agora/contracts';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { PageHeader, StateBlock } from '@/components/ui';
import { api } from '@/lib/api';
import { failureOf } from '@/lib/failure';
import { fmtDateTime } from '@/lib/format';
import { KIND_LABEL } from '@/lib/legal';

export const metadata = { title: 'Recursos e impugnações · Régua' };
export const dynamic = 'force-dynamic';

export default async function RecursosPage() {
  const r = await api<LegalPieceList>('/legal-pieces');

  return (
    <>
      <PageHeader
        title="Recursos e impugnações"
        lead="Rascunhos de impugnação, recurso e contrarrazões, com fontes oficiais para o jurídico conferir."
        stamp={r.ok ? r.data.server_now : null}
        actions={
          <Link href="/recursos/novo" className="rg-btn rg-btn-primary">
            <Icon name="plus" size={14} /> Nova peça
          </Link>
        }
      />

      {!r.ok ? (
        <StateBlock
          kind="error"
          title={failureOf(r).title}
          action={
            <Link href="/recursos" className="rg-btn wk-sm">
              <Icon name="refresh" size={14} /> Tentar de novo
            </Link>
          }
        >
          {failureOf(r).detail}
        </StateBlock>
      ) : r.data.items.length === 0 ? (
        <StateBlock
          kind="empty"
          title="Você ainda não gerou nenhuma peça."
          action={
            <Link href="/recursos/novo" className="rg-btn rg-btn-primary wk-sm">
              Gerar uma peça
            </Link>
          }
        >
          Escolha um edital, conte o que aconteceu e a IA escreve o rascunho com fontes.
        </StateBlock>
      ) : (
        <section className="wk-panel" aria-label="Lista de peças">
          <table className="wk-table">
            <thead>
              <tr>
                <th>Peça</th>
                <th>Edital</th>
                <th>Órgão</th>
                <th className="wk-num">Atualizada</th>
              </tr>
            </thead>
            <tbody>
              {r.data.items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link className="wk-link" href={`/recursos/${p.id}`}>
                      {KIND_LABEL[p.kind]}
                    </Link>
                  </td>
                  <td style={{ maxWidth: 420 }}>
                    {p.procurement_object.length > 120
                      ? `${p.procurement_object.slice(0, 120)}…`
                      : p.procurement_object}
                  </td>
                  <td>{p.organ_name}</td>
                  <td className="wk-num">{fmtDateTime(p.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
