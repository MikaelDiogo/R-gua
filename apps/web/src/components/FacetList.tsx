'use client';

import { useState } from 'react';
import type { FacetOption } from '@/lib/filters';
import s from './search.module.css';

export function FacetList({
  title,
  options,
  selected,
  onToggle,
  limit = 6,
}: {
  title: string;
  options: FacetOption[];
  selected: string[];
  onToggle: (value: string) => void;
  limit?: number;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? options : options.filter((o, i) => i < limit || selected.includes(o.value));
  return (
    <fieldset className={s.facet}>
      <legend>{title}</legend>
      <ul>
        {shown.map((o) => (
          <li key={o.value}>
            <label data-zero={o.count === 0 || undefined}>
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={() => onToggle(o.value)}
              />
              <span className={s.facetLabel}>{o.label}</span>
              <span className={`${s.facetCount} ${s.num}`}>{o.count}</span>
            </label>
          </li>
        ))}
      </ul>
      {options.length > shown.length || all ? (
        <button type="button" className={s.linkBtn} onClick={() => setAll((v) => !v)}>
          {all ? 'Mostrar menos' : `Mostrar todas (${options.length})`}
        </button>
      ) : null}
    </fieldset>
  );
}
