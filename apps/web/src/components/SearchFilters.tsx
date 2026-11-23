'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DEADLINE_OPTIONS, type DeadlineFilter, VALUE_PRESETS } from '@/lib/filters';
import { fmtBRL } from '@/lib/format';
import { Popover } from './Popover';
import s from './search.module.css';

interface OrganSuggestResponse {
  organs: OrganOption[];
}

interface OrganOption {
  cnpj: string;
  name: string;
  uf: string | null;
}

// Nomes dos órgãos já vistos (a URL guarda só o CNPJ). Fica na sessão do navegador; sem ele o chip mostra o CNPJ.
const NAMES_KEY = 'regua:orgaos:nomes:v1';
function readNames(): Record<string, string> {
  try {
    return JSON.parse(window.sessionStorage.getItem(NAMES_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}
function rememberNames(list: OrganOption[]) {
  try {
    window.sessionStorage.setItem(
      NAMES_KEY,
      JSON.stringify({ ...readNames(), ...Object.fromEntries(list.map((o) => [o.cnpj, o.name])) }),
    );
  } catch {
    /* sem armazenamento: o chip mostra o CNPJ */
  }
}
const cnpjMask = (c: string) =>
  c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c;

/** Nome de cada órgão selecionado (do cache da sessão); CNPJ formatado quando o nome não é conhecido. */
export function useOrganNames(selected: string[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const key = selected.join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: relê quando a seleção muda
  useEffect(() => setNames(readNames()), [key]);
  return Object.fromEntries(selected.map((c) => [c, names[c] ?? cnpjMask(c)]));
}

const compactBRL = (n: number) =>
  n >= 1_000_000
    ? `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
    : n >= 1_000
      ? `R$ ${Math.round(n / 1_000).toLocaleString('pt-BR')} mil`
      : fmtBRL(n);

export function valueSummary(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${compactBRL(min)} a ${compactBRL(max)}`;
  if (min !== null) return `acima de ${compactBRL(min)}`;
  if (max !== null) return `até ${compactBRL(max)}`;
  return '';
}

export function deadlineSummary(d: DeadlineFilter, from: string, to: string): string {
  if (d === 'data') {
    const f = (s: string) => (s ? s.split('-').reverse().slice(0, 2).join('/') : '…');
    return `${f(from)} a ${f(to)}`;
  }
  return DEADLINE_OPTIONS.find((o) => o.value === d)?.label.toLowerCase() ?? '';
}

/** "R$ 50.000,00" ou "50000" → 50000; vazio → null. */
const parseMoney = (s: string): number | null => {
  const clean = s.replace(/[^\d,]/g, '').replace(',', '.');
  const n = Number.parseFloat(clean);
  return Number.isFinite(n) ? n : null;
};
export function OrganFilter({
  selected,
  names,
  onChange,
}: {
  selected: string[];
  names: Record<string, string>;
  onChange: (cnpjs: string[]) => void;
}) {
  const [text, setText] = useState('');
  const [found, setFound] = useState<OrganOption[]>([]);
  const [failed, setFailed] = useState(false);
  const q = text.trim();

  // Autocomplete na API (GET /v1/organs?q=).
  useEffect(() => {
    if (q.length < 2) {
      setFound([]);
      setFailed(false);
      return;
    }
    let alive = true;
    const t = window.setTimeout(async () => {
      const r = await api<OrganSuggestResponse>(`/organs?q=${encodeURIComponent(q)}`);
      if (!alive) return;
      setFailed(!r.ok);
      if (r.ok) {
        rememberNames(r.data.organs);
        setFound(r.data.organs);
      } else setFound([]);
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [q]);

  const summary =
    selected.length === 0
      ? ''
      : selected.length === 1
        ? (names[selected[0] ?? ''] ?? '')
        : `${selected.length} selecionados`;
  const toggle = (c: string, name?: string) => {
    if (name) rememberNames([{ cnpj: c, name, uf: null }]);
    onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);
  };
  const shown: OrganOption[] =
    q.length >= 2 ? found : selected.map((c) => ({ cnpj: c, name: names[c] ?? c, uf: null }));

  return (
    <Popover inline label="Órgão" summary={summary} active={selected.length > 0}>
      {() => (
        <div className={s.popBody}>
          <label htmlFor="organ-q" className={s.popLabel}>
            Buscar órgão
          </label>
          <input
            id="organ-q"
            className={s.popInput}
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Nome do órgão ou prefeitura"
            autoComplete="off"
          />
          {failed ? (
            <p className={s.popNote}>Não foi possível buscar órgãos agora.</p>
          ) : q.length < 2 && selected.length === 0 ? (
            <p className={s.popNote}>Digite pelo menos 2 letras do nome do órgão.</p>
          ) : shown.length === 0 ? (
            <p className={s.popNote}>Nenhum órgão com esse nome.</p>
          ) : (
            <ul className={s.popList}>
              {shown.map((o) => (
                <li key={o.cnpj}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.includes(o.cnpj)}
                      onChange={() => toggle(o.cnpj, o.name)}
                    />
                    <span className={s.popItemText}>
                      {o.name} {o.uf ? <span className={s.popMuted}>· {o.uf}</span> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {selected.length ? (
            <button type="button" className={s.linkBtn} onClick={() => onChange([])}>
              Limpar órgãos
            </button>
          ) : null}
        </div>
      )}
    </Popover>
  );
}

export function ValueFilter({
  min,
  max,
  onChange,
}: {
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
}) {
  const [a, setA] = useState(min === null ? '' : fmtBRL(min));
  const [b, setB] = useState(max === null ? '' : fmtBRL(max));
  // Mantém os campos em sincronia quando o filtro muda por fora (chip removido, histórico).
  useEffect(() => {
    setA(min === null ? '' : fmtBRL(min));
    setB(max === null ? '' : fmtBRL(max));
  }, [min, max]);
  const active = min !== null || max !== null;
  const blur = (v: string, set: (s: string) => void) => {
    const n = parseMoney(v);
    set(n === null ? '' : fmtBRL(n));
  };
  return (
    <Popover inline label="Valor" summary={valueSummary(min, max)} active={active}>
      {(close) => (
        <div className={s.popBody}>
          <fieldset className={s.popChoices}>
            <legend className={s.srOnly}>Faixas de valor</legend>
            {VALUE_PRESETS.map((p) => (
              <button
                type="button"
                key={p.key}
                className={s.popChoice}
                aria-pressed={min === p.min && max === p.max}
                onClick={() => {
                  onChange(p.min, p.max);
                  setA(p.min === null ? '' : fmtBRL(p.min));
                  setB(p.max === null ? '' : fmtBRL(p.max));
                  close();
                }}
              >
                {p.label}
              </button>
            ))}
          </fieldset>
          <form
            className={s.popRange}
            onSubmit={(e) => {
              e.preventDefault();
              onChange(parseMoney(a), parseMoney(b));
              close();
            }}
          >
            <div>
              <label htmlFor="v-min" className={s.popLabel}>
                De
              </label>
              <input
                id="v-min"
                className={`${s.popInput} ${s.num}`}
                inputMode="decimal"
                placeholder="R$ 0,00"
                value={a}
                onChange={(e) => setA(e.target.value)}
                onBlur={() => blur(a, setA)}
              />
            </div>
            <div>
              <label htmlFor="v-max" className={s.popLabel}>
                Até
              </label>
              <input
                id="v-max"
                className={`${s.popInput} ${s.num}`}
                inputMode="decimal"
                placeholder="Sem limite"
                value={b}
                onChange={(e) => setB(e.target.value)}
                onBlur={() => blur(b, setB)}
              />
            </div>
            <button type="submit" className="rg-btn">
              Aplicar
            </button>
          </form>
          {active ? (
            <button
              type="button"
              className={s.linkBtn}
              onClick={() => {
                onChange(null, null);
                setA('');
                setB('');
                close();
              }}
            >
              Limpar valor
            </button>
          ) : null}
        </div>
      )}
    </Popover>
  );
}

export function DeadlineFilterControl({
  value,
  from,
  to,
  onChange,
}: {
  value: DeadlineFilter;
  from: string;
  to: string;
  onChange: (d: DeadlineFilter, from: string, to: string) => void;
}) {
  return (
    <Popover
      inline
      label="Prazo"
      summary={value ? deadlineSummary(value, from, to) : ''}
      active={value !== ''}
    >
      {(close) => (
        <div className={s.popBody}>
          <fieldset className={s.popChoices}>
            <legend className={s.srOnly}>Prazo de encerramento</legend>
            {DEADLINE_OPTIONS.map((o) => (
              <button
                type="button"
                key={o.value}
                className={s.popChoice}
                aria-pressed={value === o.value}
                onClick={() => {
                  onChange(o.value, o.value === 'data' ? from : '', o.value === 'data' ? to : '');
                  if (o.value !== 'data') close();
                }}
              >
                {o.label}
              </button>
            ))}
          </fieldset>
          {value === 'data' ? (
            <div className={s.popRange}>
              <div>
                <label htmlFor="d-from" className={s.popLabel}>
                  De
                </label>
                <input
                  id="d-from"
                  className={s.popInput}
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => onChange('data', e.target.value, to)}
                />
              </div>
              <div>
                <label htmlFor="d-to" className={s.popLabel}>
                  Até
                </label>
                <input
                  id="d-to"
                  className={s.popInput}
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => onChange('data', from, e.target.value)}
                />
              </div>
            </div>
          ) : null}
          {value ? (
            <button
              type="button"
              className={s.linkBtn}
              onClick={() => {
                onChange('', '', '');
                close();
              }}
            >
              Qualquer prazo
            </button>
          ) : null}
        </div>
      )}
    </Popover>
  );
}
