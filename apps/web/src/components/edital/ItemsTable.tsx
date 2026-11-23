'use client';

import type { ProcurementItem } from '@agora/contracts';
import { useState } from 'react';
import { fmtBRL, fmtQty } from '@/lib/format';
import s from './edital.module.css';

const PAGE = 50;

const Dash = () => (
  <span className={s.dash} role="img" aria-label="Não informado">
    —
  </span>
);

/** Valor zero ou ausente não é preço: traço cinza e a tag dizem que o órgão não informou. */
function Money({ value }: { value: number | null }) {
  if (value == null || value <= 0) {
    return (
      <span className={s.noValue}>
        <span className="rg-tag" title="O órgão não informou o valor deste item no PNCP">
          valor não informado
        </span>
        <Dash />
      </span>
    );
  }
  return <>{fmtBRL(value)}</>;
}

export function ItemsTable({ items }: { items: ProcurementItem[] }) {
  const [shown, setShown] = useState(PAGE);

  if (items.length === 0) {
    return (
      <div className="rg-empty">
        <div className="rg-empty-head">
          <span>Itens</span>
          <span className={s.num}>0</span>
        </div>
        <div className="rg-empty-body">
          <p className="rg-empty-title">O PNCP não trouxe itens para este edital.</p>
          <p>A coleta funcionou, mas o órgão não cadastrou itens. Confira o edital no PNCP.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={s.stack}>
      <p className={s.muted}>
        {items.length} {items.length === 1 ? 'item' : 'itens'} · valores estimados informados pelo
        órgão.
      </p>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Nº</th>
              <th>Descrição</th>
              <th className={s.right}>Quantidade</th>
              <th>Unidade</th>
              <th className={s.right}>Valor unitário</th>
              <th className={s.right}>Valor total</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, shown).map((it) => (
              <tr key={it.number}>
                <td className={s.num}>{it.number}</td>
                <td className={s.itemDesc}>{it.description}</td>
                <td className={s.right}>{it.quantity != null ? fmtQty(it.quantity) : <Dash />}</td>
                <td>{it.unit ?? <Dash />}</td>
                <td className={s.right}>
                  <Money value={it.unit_value} />
                </td>
                <td className={s.right}>
                  <Money value={it.total_value} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown < items.length ? (
        <button
          type="button"
          className={`rg-btn ${s.more}`}
          onClick={() => setShown((n) => n + PAGE)}
        >
          Mostrar mais {Math.min(PAGE, items.length - shown)} (de {items.length - shown} restantes)
        </button>
      ) : null}
    </div>
  );
}
