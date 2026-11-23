import type { Db } from '@agora/db';
import { PncpPublicApi } from '@agora/ingestion';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { InjectDb } from '../platform/db.module';
import { DomainError } from '../platform/problem.filter';
import { CollectService } from './collect.service';
import { findFirstPdf } from './doc-text';

const MAX_DOWNLOAD = 40 * 1024 * 1024;
const ID = z.string().uuid();
const SEQUENCE = z.coerce.number().int().min(0).max(100_000);

interface DocRow {
  title: string;
  url: string;
}

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

  async pdf(rawId: string, rawSequence: string): Promise<{ bytes: Uint8Array; filename: string }> {
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

    const dl = await this.api.download(doc.url, MAX_DOWNLOAD);
    if (!dl.ok) {
      // O endereço original (público, do PNCP) acompanha o erro para a tela oferecer "Abrir direto no PNCP".
      const meta = { pncp_url: doc.url };
      if (dl.error === 'too_large')
        throw new DomainError(
          'validation_failed',
          'O arquivo é grande demais para abrir aqui.',
          meta,
        );
      throw new DomainError(
        'source_unavailable',
        'O PNCP não entregou o arquivo agora. Tente de novo em instantes.',
        meta,
      );
    }
    const pdf = findFirstPdf(dl.data.bytes);
    if (!pdf)
      throw new DomainError(
        'unsupported_media_type',
        'Este documento não tem um PDF para abrir. Use "Abrir no portal de origem".',
      );
    return { bytes: pdf, filename: safePdfName(doc.title) };
  }
}
