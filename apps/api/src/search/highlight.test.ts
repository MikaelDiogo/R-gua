import { describe, expect, it } from 'vitest';
import { fold, highlight, queryTerms } from './highlight';

describe('fold', () => {
  it('remove acentos sem mudar o comprimento', () => {
    const s = 'Aquisição de MICROCOMPUTADORES portáteis';
    expect(fold(s)).toBe('aquisicao de microcomputadores portateis');
    expect(fold(s)).toHaveLength(s.length);
  });
});

describe('queryTerms', () => {
  it('ignora stopwords, aspas e operadores', () => {
    expect(queryTerms('"merenda escolar" de -carne or')).toEqual(['merenda', 'escolar']);
    expect(queryTerms(undefined)).toEqual([]);
  });
});

describe('highlight', () => {
  const text = 'Aquisição de notebooks e computadores para a Secretaria de Educação';

  it('marca o termo ignorando acento e caixa, e preserva o texto original', () => {
    const seg = highlight(text, 'EDUCACAO');
    expect(seg?.filter((s) => s.match).map((s) => s.text)).toEqual(['Educação']);
    expect(seg?.map((s) => s.text).join('')).toBe(text);
  });

  it('aproxima o plural/stem em termos longos', () => {
    const seg = highlight(text, 'computador');
    expect(seg?.filter((s) => s.match).map((s) => s.text)).toEqual(['computadores']);
  });

  it('não marca meio de palavra', () => {
    expect(highlight('microcomputadores', 'computador')).toBeNull();
  });

  it('sem consulta ou sem ocorrência devolve null', () => {
    expect(highlight(text, undefined)).toBeNull();
    expect(highlight(text, 'combustivel')).toBeNull();
  });

  it('o resultado é só texto: HTML no objeto não vira marcação', () => {
    const seg = highlight('<script>alert(1)</script> notebook', 'notebook');
    expect(seg?.map((s) => s.text).join('')).toBe('<script>alert(1)</script> notebook');
    expect(seg?.every((s) => typeof s.text === 'string')).toBe(true);
  });
});
