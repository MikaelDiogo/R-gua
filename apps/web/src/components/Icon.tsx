import type { SVGProps } from 'react';

const PATHS = {
  home: 'M2.5 7.5 8 3l5.5 4.5V13a.5.5 0 0 1-.5.5H9.5v-3.5h-3v3.5H3a.5.5 0 0 1-.5-.5z',
  search: 'M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm3.5-1.5L14 14',
  board: 'M2.5 3h3v10h-3zM6.5 3h3v6h-3zM10.5 3h3v8h-3z',
  bell: 'M4 11V7.5a4 4 0 0 1 8 0V11l1 1.5H3zM6.5 14h3',
  gear: 'M8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4',
  star: 'm8 2 1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.2 4.3 13.3l.8-4.1L2 6.3l4.2-.5z',
  chevronDown: 'm4 6 4 4 4-4',
  chevronRight: 'm6 4 4 4-4 4',
  x: 'm4 4 8 8M12 4l-8 8',
  check: 'm3.5 8.5 3 3 6-7',
  info: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 7.2V11M8 5v.1',
  alert: 'M8 2 14.5 13h-13zM8 6.5v3M8 11.5v.1',
  external: 'M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5',
  menu: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11',
  plus: 'M8 3v10M3 8h10',
  clock: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 4.8V8l2 1.5',
  arrowLeft: 'M13 8H3m4-4L3 8l4 4',
  arrowRight: 'M3 8h10M9 4l4 4-4 4',
  refresh: 'M13 5.5A5.5 5.5 0 0 0 3.2 6M3 2.5V6h3.5M3 10.5A5.5 5.5 0 0 0 12.8 10M13 13.5V10H9.5',
  sparkle: 'M8 2.5 9.3 6.7 13.5 8 9.3 9.3 8 13.5 6.7 9.3 2.5 8 6.7 6.7z',
  doc: 'M4 2h5l3 3v9H4zM9 2v3h3M6 8h4M6 10.5h4',
  chat: 'M3 3.5h10v7H8.5L5.5 13v-2.5H3zM5.5 6.2h5M5.5 8.2h3',
  bars: 'M2.5 4h4M2.5 8h9M2.5 12h6',
  paperclip:
    'm13 7.5-4.8 4.8a3 3 0 0 1-4.2-4.3l5-5a2 2 0 0 1 2.8 2.9L7 11.2a1 1 0 0 1-1.4-1.4L10 5.4',
  send: 'M8 13V3M4 7l4-4 4 4',
  lock: 'M4.5 7V5.5a3.5 3.5 0 0 1 7 0V7M3.5 7h9v6.5h-9z',
} as const;

export type IconName = keyof typeof PATHS;

/** Ícones de traço de 1,75px, cantos arredondados, `currentColor`, 16–18px (design Régua, "Iconografia"). */
export function Icon({
  name,
  size = 16,
  ...rest
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Monograma: três barras de prazo cortadas pela linha de hoje (barras em tinta, linha em accent). */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className="mark"
    >
      <rect x="5" y="7" width="22" height="5" rx="2" fill="var(--ink)" />
      <rect x="5" y="14" width="14" height="5" rx="2" fill="var(--ink)" />
      <rect x="5" y="21" width="18" height="5" rx="2" fill="var(--ink)" />
      <rect x="21" y="4" width="1.5" height="25" fill="var(--accent)" />
    </svg>
  );
}

/** Marca: monograma e o nome em Newsreader. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={`rg-brand ${className ?? ''}`} role="img" aria-label="Régua">
      <Mark />
      <span className="rg-brand-name" aria-hidden="true">
        Régua
      </span>
    </span>
  );
}
