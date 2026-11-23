import { describe, expect, it } from 'vitest';
import { mapStatusFromName } from './tables';

describe('mapStatusFromName (situação do PNCP → enum do contrato)', () => {
  it.each([
    ['Divulgada no PNCP', 'divulgada'],
    ['Revogada', 'canceled'],
    ['Anulada', 'canceled'],
    ['Cancelada', 'canceled'],
    ['Suspensa', 'suspended'],
    ['Homologada', 'closed'],
    ['Encerrada', 'closed'],
    ['Fracassada', 'closed'],
    ['Deserta', 'closed'],
    ['Em julgamento', 'in_session'],
    ['Qualquer coisa nova', 'unknown'],
  ])('%s → %s', (nome, esperado) => {
    expect(mapStatusFromName(nome)).toBe(esperado);
  });
});
