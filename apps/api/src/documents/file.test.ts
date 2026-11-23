import type { Db } from '@agora/db';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../platform/problem.filter';
import type { CollectService } from './collect.service';
import { findFirstPdf } from './doc-text';
import { DocumentFileService, safePdfName } from './file.service';

const pdf = (marker: string) => new TextEncoder().encode(`%PDF-1.4 ${marker}`);
const ID = '11111111-1111-4111-8111-111111111111';

describe('findFirstPdf', () => {
  it('devolve o próprio PDF, olhando o conteúdo e não a extensão', () => {
    const b = pdf('direto');
    expect(findFirstPdf(b)).toBe(b);
  });
  it('acha o PDF dentro de ZIP e de ZIP dentro de ZIP, preferindo "edital" no nome', () => {
    const inner = zipSync({
      'anexo.txt': new TextEncoder().encode('x'),
      'Edital.pdf': pdf('edital'),
    });
    const outer = zipSync({ 'a.zip': inner, 'planilha.pdf': pdf('outro') });
    const found = findFirstPdf(outer);
    expect(found && new TextDecoder().decode(found)).toContain('edital');
  });
  it('sem PDF devolve null (texto puro, ZIP sem PDF)', () => {
    expect(findFirstPdf(new TextEncoder().encode('oi'))).toBeNull();
    expect(findFirstPdf(zipSync({ 'a.txt': new TextEncoder().encode('x') }))).toBeNull();
  });
});

describe('safePdfName', () => {
  it('só ASCII seguro, sem aspas nem barras, terminando em .pdf', () => {
    expect(safePdfName('Edital Nº 045/2026 "Pregão".zip')).toBe('Edital_N_045_2026_Pregao.pdf');
    expect(safePdfName('../../etc/passwd')).toBe('etc_passwd.pdf');
    expect(safePdfName('???')).toBe('edital.pdf');
  });
});

function svc(opts: {
  doc?: { title: string; url: string };
  collectedAt?: Date | null;
  exists?: boolean;
}) {
  let collected = 0;
  const db = {
    query: async (sql: string) => {
      if (sql.includes('FROM procurement_documents'))
        return { rows: opts.doc ? [opts.doc] : [], rowCount: opts.doc ? 1 : 0 };
      if (sql.includes('documents_collected_at FROM procurements')) {
        const exists = opts.exists ?? true;
        return {
          rows: exists
            ? [{ documents_collected_at: 'collectedAt' in opts ? opts.collectedAt : new Date() }]
            : [],
          rowCount: exists ? 1 : 0,
        };
      }
      throw new Error('consulta não prevista');
    },
  } as unknown as Db;
  const collect = {
    collect: async () => {
      collected++;
    },
  } as unknown as CollectService;
  return { s: new DocumentFileService(db, collect), collected: () => collected };
}

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e instanceof DomainError ? e.code : `outro:${String(e)}`;
  }
  return 'ok';
}

describe('DocumentFileService', () => {
  it('documento inexistente → 404 (e não coleta de novo se já foi coletado)', async () => {
    const { s, collected } = svc({ doc: undefined, collectedAt: new Date() });
    expect(await codeOf(s.pdf(ID, '1'))).toBe('not_found');
    expect(collected()).toBe(0);
  });

  it('edital sem documentos coletados dispara a coleta uma vez', async () => {
    const { s, collected } = svc({ doc: undefined, collectedAt: null });
    expect(await codeOf(s.pdf(ID, '1'))).toBe('not_found');
    expect(collected()).toBe(1);
  });

  it('edital inexistente → 404', async () => {
    const { s } = svc({ doc: undefined, exists: false });
    expect(await codeOf(s.pdf(ID, '1'))).toBe('not_found');
  });

  it('só baixa de host permitido do PNCP: URL de outro host nunca é aberta', async () => {
    const { s } = svc({ doc: { title: 'Edital', url: 'https://evil.example.com/edital.pdf' } });
    expect(await codeOf(s.pdf(ID, '1'))).toBe('source_unavailable');
    const http = svc({ doc: { title: 'Edital', url: 'http://pncp.gov.br/edital.pdf' } });
    expect(await codeOf(http.s.pdf(ID, '1'))).toBe('source_unavailable');
    const local = svc({ doc: { title: 'Edital', url: 'https://127.0.0.1/edital.pdf' } });
    expect(await codeOf(local.s.pdf(ID, '1'))).toBe('source_unavailable');
  });

  it('id e sequência malformados são rejeitados antes de qualquer consulta', async () => {
    const { s } = svc({});
    expect(await codeOf(s.pdf('nao-uuid', '1'))).toMatch(/^outro:/);
    expect(await codeOf(s.pdf(ID, 'abc'))).toMatch(/^outro:/);
  });

  it('open: PDF direto sai em fluxo, inteiro e sem passar pela memória toda de uma vez', async () => {
    const { s } = svc({ doc: { title: 'Edital', url: 'https://pncp.gov.br/a' } });
    const body = new Blob([pdf('conteudo-do-edital'), new Uint8Array(200_000)]).stream();
    (s as unknown as { api: unknown }).api = {
      openFile: async () => ({
        ok: true,
        data: {
          res: new Response(body, { headers: { 'content-length': '200027' } }),
          filename: 'Edital Nº 1.pdf',
        },
      }),
    };
    const f = await s.open(ID, '1');
    expect(f.kind).toBe('stream');
    if (f.kind !== 'stream') return;
    expect(f.filename).toBe('Edital_N_1.pdf');
    expect(f.length).toBe(200027);
    let n = 0;
    let first = '';
    for await (const c of f.stream) {
      if (!first) first = new TextDecoder().decode((c as Uint8Array).slice(0, 8));
      n += (c as Uint8Array).length;
    }
    expect(first).toBe('%PDF-1.4');
    expect(n).toBe(200027);
  });

  it('open: ZIP é aberto e o PDF de dentro é entregue em bytes; sem PDF dentro → 415', async () => {
    const { s } = svc({ doc: { title: 'Anexos', url: 'https://pncp.gov.br/a' } });
    const serve = (bytes: Uint8Array) => {
      (s as unknown as { api: unknown }).api = {
        openFile: async () => ({ ok: true, data: { res: new Response(bytes), filename: null } }),
      };
    };
    serve(zipSync({ 'Edital.pdf': pdf('dentro-do-zip') }));
    const f = await s.open(ID, '1');
    expect(f.kind).toBe('bytes');
    if (f.kind === 'bytes') expect(new TextDecoder().decode(f.bytes)).toContain('dentro-do-zip');
    serve(zipSync({ 'a.txt': new TextEncoder().encode('x') }));
    expect(await codeOf(s.open(ID, '1'))).toBe('unsupported_media_type');
  });

  it('open: falha da fonte e arquivo declarado grande demais viram erro claro com o endereço do PNCP', async () => {
    const { s } = svc({ doc: { title: 'Edital', url: 'https://pncp.gov.br/a' } });
    (s as unknown as { api: unknown }).api = {
      openFile: async () => ({ ok: false, status: 422, error: 'http_422' }),
    };
    expect(await codeOf(s.open(ID, '1'))).toBe('source_unavailable');
    (s as unknown as { api: unknown }).api = {
      openFile: async () => ({
        ok: true,
        data: {
          res: new Response('x', { headers: { 'content-length': String(500 * 1024 * 1024) } }),
          filename: null,
        },
      }),
    };
    expect(await codeOf(s.open(ID, '1'))).toBe('validation_failed');
    try {
      await s.open(ID, '1');
    } catch (e) {
      expect((e as DomainError).meta?.pncp_url).toBe('https://pncp.gov.br/a');
    }
  });

  it('open: host que não é do PNCP nunca é aberto', async () => {
    const { s } = svc({ doc: { title: 'Edital', url: 'https://evil.example.com/edital.pdf' } });
    expect(await codeOf(s.open(ID, '1'))).toBe('source_unavailable');
  });
});
