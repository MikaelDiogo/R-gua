/** Estados cobertos pelo Régua (mesma lista de `ALLOWED_UFS` em @agora/contracts; o servidor é quem aplica o limite). */
export const COVERAGE_UFS = ['CE', 'PI'] as const;

export const COVERAGE_LABEL = 'Ceará e Piauí';

export type CoverageUf = (typeof COVERAGE_UFS)[number];

/** Nome por extenso de cada UF, para botões e textos. */
export const UF_NAMES: Record<CoverageUf, string> = {
  CE: 'Ceará',
  PI: 'Piauí',
};

export const ufName = (uf: string): string => UF_NAMES[uf as CoverageUf] ?? uf;
