'use client';

import { fmtInt } from '@/lib/format';
import { PAGE_SIZES } from '@/lib/paging';
import { Icon } from './Icon';
import s from './search.module.css';

/** "1–20 de ~1.840": total acima da lista; "~" quando o total é aproximado (`meta.total_exact=false`). */
export function RangeText({
  from,
  to,
  total,
  approx = false,
  noun = 'resultados',
}: {
  from: number;
  to: number;
  total: number;
  approx?: boolean;
  noun?: string;
}) {
  if (total === 0) return <span>0 {noun}</span>;
  return (
    <span>
      <span className={s.num}>
        {from}–{to}
      </span>{' '}
      de{' '}
      <span className={s.num}>
        {approx ? '~' : ''}
        {fmtInt(total)}
      </span>{' '}
      {noun}
    </span>
  );
}

function pageList(current: number, pages: number): (number | 'gap-a' | 'gap-b')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, current - 1, current, current + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | 'gap-a' | 'gap-b')[] = [];
  nums.forEach((n, i) => {
    const prev = nums[i - 1];
    if (prev != null && n - prev > 1) out.push(i < 3 ? 'gap-a' : 'gap-b');
    out.push(n);
  });
  return out;
}

/** Rodapé da lista: tamanho de página, Anterior / números / Próxima. Tudo é botão nativo (Tab, Enter, Espaço). */
export function Pagination({
  page,
  pages,
  perPage,
  onPage,
  onPerPage,
  label = 'Paginação',
  id,
}: {
  page: number;
  pages: number;
  perPage: number;
  onPage: (n: number) => void;
  onPerPage: (n: number) => void;
  label?: string;
  id: string;
}) {
  return (
    <div className={s.pager}>
      <div className={s.pagerSize}>
        <label htmlFor={`${id}-size`}>Por página</label>
        <select
          id={`${id}-size`}
          value={perPage}
          onChange={(e) => onPerPage(Number(e.target.value))}
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {pages > 1 ? (
        <nav className={s.pagerNav} aria-label={label}>
          <button
            type="button"
            className={s.pagerBtn}
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <Icon name="arrowLeft" size={14} /> Anterior
          </button>
          <span className={`${s.pagerStatus} ${s.num}`} aria-hidden="true">
            {page} de {pages}
          </span>
          <ol className={s.pagerNums}>
            {pageList(page, pages).map((n) =>
              typeof n === 'number' ? (
                <li key={n}>
                  <button
                    type="button"
                    className={`${s.pagerBtn} ${s.num}`}
                    aria-current={n === page ? 'page' : undefined}
                    aria-label={`Página ${n}`}
                    onClick={() => onPage(n)}
                  >
                    {n}
                  </button>
                </li>
              ) : (
                <li key={n} className={s.pagerGap} aria-hidden="true">
                  …
                </li>
              ),
            )}
          </ol>
          <button
            type="button"
            className={s.pagerBtn}
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
          >
            Próxima <Icon name="arrowRight" size={14} />
          </button>
        </nav>
      ) : null}
    </div>
  );
}
