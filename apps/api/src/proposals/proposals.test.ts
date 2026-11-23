import { describe, expect, it } from 'vitest';
import { itemQuery } from '../pricing/pricing.service';
import { missingForProposal } from './profile.service';
import { divergentAmounts } from './proposals.service';

describe('divergentAmounts', () => {
  it('aceita valores calculados pelo servidor e aponta os que não conferem', () => {
    const allowed = [1500, 750.5];
    expect(divergentAmounts('Valor total de R$ 1.500,00 e unitário R$ 750,50.', allowed)).toEqual(
      [],
    );
    expect(divergentAmounts('Oferecemos R$ 1.200,00 no total.', allowed)).toEqual(['R$ 1.200,00']);
  });
});

describe('missingForProposal', () => {
  it('lista o que falta, inclusive CNPJ inválido', () => {
    expect(missingForProposal(null)).toContain('CNPJ');
    const m = missingForProposal({
      legal_name: 'X',
      cnpj: '11.222.333/0001-82',
      trade_name: null,
      porte: null,
      segments: [],
      ufs: [],
      email: null,
      phone: null,
      address: null,
      legal_rep_name: null,
      legal_rep_role: null,
      certificates: [],
      technical_attestations: null,
    });
    expect(m).toEqual(expect.arrayContaining(['CNPJ válido', 'Representante legal', 'Endereço']));
  });
  it('perfil completo não falta nada', () => {
    expect(
      missingForProposal({
        legal_name: 'X Ltda',
        cnpj: '11.222.333/0001-81',
        trade_name: null,
        porte: 'me',
        segments: [],
        ufs: [],
        email: 'a@b.com',
        phone: null,
        address: 'Rua 1',
        legal_rep_name: 'Fulano',
        legal_rep_role: null,
        certificates: [],
        technical_attestations: null,
      }),
    ).toEqual([]);
  });
});

describe('itemQuery', () => {
  it('usa os termos mais distintivos e exige ao menos dois', () => {
    expect(itemQuery('Notebook 15 polegadas, processador Intel Core i5, 16GB de memória')).toMatch(
      /&/,
    );
    expect(itemQuery('Item')).toBeNull();
  });
});
