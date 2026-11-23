import { Readable } from 'node:stream';
import type { Db } from '@agora/db';
import { PncpPublicApi } from '@agora/ingestion';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { InjectDb } from '../platform/db.module';
import { DomainError } from '../platform/problem.filter';
import { CollectService } from './collect.service';
import { findFirstPdf, isPdf } from './doc-text';

/** PDF entregue em fluxo: não passa pela memória, então o teto pode ser alto. */
const MAX_STREAM = 150 * 1024 * 1024;
/** ZIP e afins precisam ser abertos na memória para achar o PDF: teto menor. */
const MAX_DOWNLOAD = 40 * 1024 * 1024;
const ID = z.string().uuid();
const SEQUENCE = z.coerce.number().int().min(0).max(100_000);

interface DocRow {
  title: string;
  url: string;
}

/** O que o controlador entrega ao navegador: um fluxo (PDF direto) ou bytes (PDF extraído de um ZIP). */
export type OpenedFile =
  | { kind: 'stream'; stream: Readable; filename: string; length: number | null }
  | { kind: 'bytes'; bytes: Uint8Array; filename: string };

/** Nome de arquivo seguro para o cabeçalho: ASCII, sem aspas nem barras, sempre terminando em .pdf. */
export function safePdfName(title: string): string {
  const base = title
    .replace(/\.(pdf|zip)$/i, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 80);
  return `${base || 'edital'}.pdf`;
}

/**
 * PDF do edital para o navegador abrir ("Ler PDF do edital"). A URL sai SEMPRE do banco e o download passa pela
 * allowlist de hosts do PNCP com teto de bytes (docs/10 §5): o cliente só diz qual edital e qual documento.
 */
@Injectable()
export class DocumentFileService {
  private readonly api = new PncpPublicApi({ maxCallsPerMinute: 20 });

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly collect: CollectService,
  ) {}

  private async find(procurementId: string, sequence: number): Promise<DocRow | undefined> {
    const r = await this.db.query<DocRow>(
      `SELECT title, url FROM procurement_documents
       WHERE procurement_id = $1 AND sequence = $2 AND active`,
      [procurementId, sequence],
    );
    return r.rows[0];
  }

  private async locate(rawId: string, rawSequence: string): Promise<DocRow> {
    const id = ID.parse(rawId);
    const sequence = SEQUENCE.parse(rawSequence);

    let doc = await this.find(id, sequence);
    if (!doc) {
      // Edital sem documentos coletados: coleta uma vez e tenta de novo. Falha da fonte vira "não encontrado" abaixo.
      const p = await this.db.query<{ documents_collected_at: Date | null }>(
        'SELECT documents_collected_at FROM procurements WHERE id = $1',
        [id],
      );
      if (p.rowCount === 0) throw new DomainError('not_found', 'Edital não encontrado.');
      if (!p.rows[0]?.documents_collected_at) {
        await this.collect.collect(id);
        doc = await this.find(id, sequence);
      }
    }
    if (!doc) throw new DomainError('not_found', 'Documento do edital não encontrado.');
    return doc;
  }

  /** Erro de origem com o endereço público do PNCP, para a tela oferecer "Abrir direto no PNCP". */
  private sourceError(doc: DocRow, tooLarge: boolean): DomainError {
    const meta = { pncp_url: doc.url };
    return tooLarge
      ? new DomainError('validation_failed', 'O arquivo é grande demais para abrir aqui.', meta)
      : new DomainError(
          'source_unavailable',
          'O PNCP não entregou o arquivo agora. Tente de novo em instantes.',
          meta,
        );
  }

  /**
   * Abre o documento para o navegador SEM carregá-lo inteiro na memória quando é um PDF (a hospedagem gratuita
   * tem ~512 MB e um PDF de 20 MB já derrubava o processo). ZIP é aberto na memória para achar o PDF dentro.
   */
  async open(rawId: string, rawSequence: string): Promise<OpenedFile> {
    const doc = await this.locate(rawId, rawSequence);
    const opened = await this.api.openFile(doc.url);
    if (!opened.ok) throw this.sourceError(doc, false);
    const { res, filename: remoteName } = opened.data;
    const name = safePdfName(remoteName ?? doc.title);
    const declared = Number(res.headers.get('content-length') ?? 0);
    const reader = res.body?.getReader();
    if (!reader || declared > MAX_STREAM) {
      await res.body?.cancel().catch(() => undefined);
      throw this.sourceError(doc, declared > MAX_STREAM);
    }

    let head: Uint8Array;
    try {
      const first = await reader.read();
      if (first.done || !first.value?.length) throw new Error('vazio');
      head = first.value;
    } catch {
      await reader.cancel().catch(() => undefined);
      throw this.sourceError(doc, false);
    }

    if (isPdf(head)) {
      const rd: ReadableStreamDefaultReader<Uint8Array> = reader;
      let total = head.length;
      async function* chunks() {
        yield head;
        for (;;) {
          const { done, value } = await rd.read();
          if (done) return;
          total += value.length;
          if (total > MAX_STREAM) {
            await rd.cancel().catch(() => undefined);
            throw new Error('arquivo grande demais');
          }
          yield value;
        }
      }
      return {
        kind: 'stream',
        stream: Readable.from(chunks()),
        filename: name,
        length: declared || null,
      };
    }

    // Não é PDF direto (provavelmente ZIP): lê com teto e procura o PDF dentro.
    const parts: Uint8Array[] = [head];
    let size = head.length;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_DOWNLOAD) {
          await reader.cancel().catch(() => undefined);
          throw this.sourceError(doc, true);
        }
        parts.push(value);
      }
    } catch (e) {
      if (e instanceof DomainError) throw e;
      throw this.sourceError(doc, false);
    }
    const bytes = new Uint8Array(size);
    let off = 0;
    for (const p of parts) {
      bytes.set(p, off);
      off += p.length;
    }
    const pdf = findFirstPdf(bytes);
    if (!pdf)
      throw new DomainError(
        'unsupported_media_type',
        'Este documento não tem um PDF para abrir. Use "Abrir no portal de origem".',
      );
    return { kind: 'bytes', bytes: pdf, filename: name };
  }

  /** Versão em memória (usada pelos testes e por quem precisa dos bytes). */
  async pdf(rawId: string, rawSequence: string): Promise<{ bytes: Uint8Array; filename: string }> {
    const doc = await this.locate(rawId, rawSequence);
    const dl = await this.api.download(doc.url, MAX_DOWNLOAD);
    if (!dl.ok) throw this.sourceError(doc, dl.error === 'too_large');
    const pdf = findFirstPdf(dl.data.bytes);
    if (!pdf)
      throw new DomainError(
        'unsupported_media_type',
        'Este documento não tem um PDF para abrir. Use "Abrir no portal de origem".',
      );
    return { bytes: pdf, filename: safePdfName(doc.title) };
  }
}
