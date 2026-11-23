import Link from 'next/link';
import s from './monitores.module.css';

const PRESETS = [
  {
    title: 'Notebooks e informática',
    hint: 'Computadores, notebooks e periféricos',
    q: 'notebook or computador or informática',
  },
  {
    title: 'Medicamentos e saúde',
    hint: 'Remédios e insumos de posto de saúde',
    q: 'medicamentos or "material médico"',
  },
  {
    title: 'Assessoria jurídica e LGPD',
    hint: 'Serviços jurídicos e proteção de dados',
    q: '"assessoria jurídica" or lgpd or "proteção de dados"',
  },
] as const;

/** Atalhos de um clique: abrem o assistente de monitor já preenchido (a pessoa ainda confere e cria). */
export function Shortcuts() {
  return (
    <ul className={s.shortcuts} aria-label="Criar monitor a partir de um exemplo">
      {PRESETS.map((p) => (
        <li key={p.title}>
          <Link
            href={`/monitores/novo?${new URLSearchParams({ q: p.q }).toString()}`}
            className={s.shortcut}
          >
            <span className={s.shortcutTitle}>{p.title}</span>
            <span className={s.shortcutHint}>{p.hint}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
