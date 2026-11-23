import { describe, expect, it } from 'vitest';
import {
  extractPlace,
  findMunicipalities,
  MUNICIPALITIES,
  searchMunicipalities,
  stripSearchNoise,
} from './municipalities';

describe('dados do IBGE', () => {
  it('tem os 184 municípios do CE e os 224 do PI, com código de 7 dígitos', () => {
    expect(MUNICIPALITIES.filter((m) => m.uf === 'CE')).toHaveLength(184);
    expect(MUNICIPALITIES.filter((m) => m.uf === 'PI')).toHaveLength(224);
    expect(MUNICIPALITIES.every((m) => /^\d{7}$/.test(m.ibge))).toBe(true);
  });
  it('Crateús e Crato são cidades diferentes (2304103 e 2304202)', () => {
    expect(MUNICIPALITIES.find((m) => m.name === 'Crateús')?.ibge).toBe('2304103');
    expect(MUNICIPALITIES.find((m) => m.name === 'Crato')?.ibge).toBe('2304202');
  });
});

describe('findMunicipalities', () => {
  it('acha a cidade sem acento e sem diferenciar caixa', () => {
    const [m] = findMunicipalities('licitações em crateus');
    expect(m?.municipalities.map((x) => x.name)).toEqual(['Crateús']);
    expect(findMunicipalities('LICITAÇÕES EM CRATEÚS')).toHaveLength(1);
  });
  it('"Crato" não vira "Crateús" e vice-versa (palavra inteira)', () => {
    expect(findMunicipalities('em Crato')[0]?.municipalities[0]?.ibge).toBe('2304202');
    expect(findMunicipalities('em Crateús')[0]?.municipalities[0]?.ibge).toBe('2304103');
  });
  it('o nome mais longo ganha: "Limoeiro do Norte" e "Santa Quitéria"', () => {
    expect(findMunicipalities('obras em Limoeiro do Norte')[0]?.municipalities[0]?.name).toBe(
      'Limoeiro do Norte',
    );
    expect(findMunicipalities('Santa Quitéria')[0]?.municipalities[0]?.name).toBe('Santa Quitéria');
  });
  it('vários lugares voltam todos ("Crateús e Sobral")', () => {
    const names = findMunicipalities('licitações em Crateús e Sobral').map(
      (m) => m.municipalities[0]?.name,
    );
    expect(names).toEqual(['Crateús', 'Sobral']);
  });
  it('nome que também é palavra comum só vale com maiúscula: "tijolo de barro" não é a cidade', () => {
    expect(findMunicipalities('compra de tijolo de barro')).toHaveLength(0);
    expect(findMunicipalities('licitações em Barro')[0]?.municipalities[0]?.name).toBe('Barro');
  });
  it('sem cidade no texto, nada', () => {
    expect(findMunicipalities('notebooks para escola')).toHaveLength(0);
  });
});

describe('stripSearchNoise e extractPlace', () => {
  it('"licitações em Crateús" vira filtro de cidade e NENHUMA exigência de texto', () => {
    const p = extractPlace('Licitações em Crateús');
    expect(p.municipalities.map((m) => m.ibge)).toEqual(['2304103']);
    expect(p.rest).toBe('');
  });
  it('mantém o que o usuário quer comprar', () => {
    const p = extractPlace('quero ver licitações de merenda escolar em Crateús');
    expect(p.municipalities.map((m) => m.name)).toEqual(['Crateús']);
    expect(p.rest).toBe('merenda escolar');
  });
  it('lugar fora de CE/PI é dito, não trocado por outro', () => {
    const p = extractPlace('licitações em São Paulo');
    expect(p.municipalities).toHaveLength(0);
    expect(p.outside).toEqual(['São Paulo']);
    expect(extractPlace('licitações para o Pará').outside).toEqual(['Pará']);
    expect(extractPlace('material para escola').outside).toEqual([]); // "para" minúsculo não é o estado
  });
  it('stripSearchNoise tira pedido e preposição', () => {
    expect(stripSearchNoise('quero ver todas as licitações abertas')).toBe('');
    expect(stripSearchNoise('notebooks para a escola')).toBe('notebooks escola');
  });
});

describe('searchMunicipalities (autocomplete)', () => {
  it('começa por quem começa com o texto', () => {
    const r = searchMunicipalities('crat', 5);
    expect(r.map((m) => m.name)).toEqual(['Crateús', 'Crato']);
  });
});
