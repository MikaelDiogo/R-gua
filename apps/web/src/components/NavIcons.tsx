// Ícones do menu para Monitores, Precificador e Recursos. Mesmo traço do Icon.tsx (16px, 1.5px, contorno).
const PATHS = {
  monitor: 'M2 8h2.5l1.5-4 3 8 1.5-4H14',
  price: 'M3 3h5.5L14 8.5 8.5 14 3 8.5zM6 6h.1',
  building: 'M3 14V2.5h6V14M9 6h4v8M5.5 5h1M5.5 7.5h1M5.5 10h1M11 8.5h1M11 11h1M2 14h12',
  gavel: 'M9.5 2.5 13.5 6.5M8 4l4 4-3.5 3.5-4-4zM2.5 13.5h6M5.5 9.5l-2 2',
} as const;

export type ExtraIconName = keyof typeof PATHS;

export function ExtraIcon({ name, size = 16 }: { name: ExtraIconName; size?: number }) {
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
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
