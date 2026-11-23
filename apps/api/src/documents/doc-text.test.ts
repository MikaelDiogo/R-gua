import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { verifyCitation } from '../ai/analysis.service';
import { extractPages, LIMITS } from './doc-text';

describe('extractPages', () => {
  it('formato desconhecido é "unsupported" (o tipo vem do conteúdo, não da extensão)', async () => {
    expect((await extractPages(strToU8('texto puro'), 'x.pdf')).status).toBe('unsupported');
  });

  it('ZIP com entradas demais é recusado antes de descompactar (limite de entradas)', async () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i <= LIMITS.maxZipEntries; i++) files[`f${i}.txt`] = strToU8('x');
    expect((await extractPages(zipSync(files), 'z')).status).toBe('too_large');
  });

  it('ZIP sem PDF dentro é "unsupported"', async () => {
    expect((await extractPages(zipSync({ 'a.txt': strToU8('oi') }), 'z')).status).toBe(
      'unsupported',
    );
  });

  it('PDF corrompido é "failed", sem derrubar o processo', async () => {
    const bad = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3, 4]);
    expect((await extractPages(bad, 'x')).status).toBe('failed');
  });
});

describe('verifyCitation', () => {
  const pages = [
    { label: 'Edital.pdf', page: 1, text: 'abertura', norm: 'abertura' },
    {
      label: 'Edital.pdf',
      page: 2,
      text: 'A empresa deve apresentar certidão negativa de débitos.',
      norm: 'a empresa deve apresentar certidao negativa de debitos.',
    },
  ];
  it('confere trecho literal na página citada, ignorando acento e caixa', () => {
    const c = verifyCitation(
      { document: 'Edital.pdf', page: 2, quote: 'Apresentar CERTIDÃO negativa de débitos' },
      pages,
    );
    expect(c).toMatchObject({ verified: true, page: 2 });
  });
  it('corrige a página quando o trecho existe em outra página do mesmo arquivo', () => {
    expect(
      verifyCitation(
        { document: 'Edital.pdf', page: 1, quote: 'certidão negativa de débitos' },
        pages,
      ),
    ).toMatchObject({ verified: true, page: 2 });
  });
  it('trecho inventado fica "não conferido"', () => {
    expect(
      verifyCitation(
        { document: 'Edital.pdf', page: 2, quote: 'exige capital social mínimo de dez milhões' },
        pages,
      ).verified,
    ).toBe(false);
  });
  it('tolera pontuação, quebra de linha e pequena diferença, mas não texto inventado', () => {
    const text =
      'O licitante deverá comprovar regularidade fiscal, trabalhista e previdenciária, mediante\napresentação das certidões negativas.';
    const p = [{ label: 'E.pdf', page: 3, text, norm: text.toLowerCase() }];
    const parecido =
      'O licitante deverá comprovar regularidade fiscal trabalhista e previdenciária mediante apresentação das certidões negativas';
    expect(verifyCitation({ document: 'E.pdf', page: 3, quote: parecido }, p).verified).toBe(true);
    const outraPalavra =
      'O licitante deverá comprovar regularidade fiscal trabalhista e previdenciária mediante entrega das certidões negativas';
    expect(verifyCitation({ document: 'E.pdf', page: 3, quote: outraPalavra }, p).verified).toBe(
      true,
    );
    const inventado =
      'O licitante deverá possuir patrimônio líquido mínimo de dez por cento do valor estimado da contratação';
    expect(verifyCitation({ document: 'E.pdf', page: 3, quote: inventado }, p).verified).toBe(
      false,
    );
  });
  it('trecho curto demais não vale como prova', () => {
    expect(verifyCitation({ document: 'Edital.pdf', page: 1, quote: 'de' }, pages).verified).toBe(
      false,
    );
  });
});
