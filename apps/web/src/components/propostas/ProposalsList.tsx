'use client';

import type { ProposalList } from '@agora/contracts';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { fmtBRL, fmtDateTime } from '@/lib/format';
import { Dash } from '../ui';
import s from './propostas.module.css';

type Row = ProposalList['items'][number];
type Sort = 'recent' | 'value' | 'organ';

const fold = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Lista de propostas com busca (objeto ou órgão) e ordenação. */
export function ProposalsList({ items }: { items: Row[] }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('recent');

  const rows = useMemo(() => {
    const needle = fold(q.trim());
    const filtered = needle
      ? items.filter((p) => fold(`${p.procurement_object} ${p.organ_name}`).includes(needle))
      : items;
    const sorted = [...filtered];
    if (sort === 'recent') sorted.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    if (sort === 'value') sorted.sort((a, b) => b.total - a.total);
    if (sort === 'organ') sorted.sort((a, b) => a.organ_name.localeCompare(b.organ_name, 'pt-BR'));
    return sorted;
  }, [items, q, sort]);

  return (
    <section className="wk-panel" aria-label="Lista de propostas">
      <div className={s.listTools}>
        <div className={s.listSearch}>
          <label htmlFor="prop-q">Buscar nas propostas</label>
          <input
            id="prop-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Objeto ou órgão"
            autoComplete="off"
          />
        </div>
        <div className={s.listSort}>
          <label htmlFor="prop-sort">Ordenar por</label>
          <select id="prop-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="recent">Mais recentes</option>
            <option value="value">Maior valor</option>
            <option value="organ">Órgão (A a Z)</option>
          </select>
        </div>
        <span className={s.note} role="status" aria-live="polite">
          {rows.length} de {items.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className={s.note}>Nenhuma proposta com esta busca.</p>
      ) : (
        <table className="wk-table">
          <thead>
            <tr>
              <th>Edital</th>
              <th>Órgão</th>
              <th className="wk-num">Total</th>
              <th className="wk-num">Atualizada</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td style={{ maxWidth: 420 }}>
                  <Link className="wk-link" href={`/propostas/${p.id}`}>
                    {p.procurement_object.length > 120
                      ? `${p.procurement_object.slice(0, 120)}…`
                      : p.procurement_object}
                  </Link>
                </td>
                <td>{p.organ_name}</td>
                <td className="wk-num">{p.total > 0 ? fmtBRL(p.total) : <Dash />}</td>
                <td className="wk-num">{fmtDateTime(p.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
