import { createHash } from 'node:crypto';
import type { ProcurementDetail, ProcurementDocument, ProcurementItem } from '@agora/contracts';
import type { Db } from '@agora/db';
import { PncpPublicApi } from '@agora/ingestion';
import { Injectable } from '@nestjs/common';
import { InjectDb } from '../platform/db.module';
import { DomainError } from '../platform/problem.filter';
import { extractPages } from './doc-text';

/** Teto para LER o texto (PDF grande, em geral digitalizado, estoura a memória da hospedagem gratuita). Abrir o PDF tem teto próprio. */
const MAX_DOWNLOAD = 15 * 1024 * 1024;
/** Documentos que o leitor usa, na ordem de importância. Anexos de minuta e planilhas ficam de fora. */
const PRIORITY = [/edital/i, /termo de refer/i, /projeto b[aá]sico/i];

const DOC_TEXT_STATUS = ['pending', 'ok', 'failed', 'too_large', 'scanned', 'unsupported'] as const;

interface ProcRow {
  id: string;
  organ_cnpj: string;
  year: number;
  sequence: number;
  items_collected_at: Date | null;
  documents_collected_at: Date | null;
}

@Injectable()
export class CollectService {
  private readonly api = new PncpPublicApi({ maxCallsPerMinute: 20 });
  /** Coletas em andamento por edital: duas aberturas simultâneas não chamam o PNCP duas vezes. */
  private readonly inflight = new Map<string, Promise<void>>();

  constructor(@InjectDb() private readonly db: Db) {}

  private async proc(id: string): Promise<ProcRow> {
    const r = await this.db.query<ProcRow>(
      'SELECT id, organ_cnpj, year, sequence, items_collected_at, documents_collected_at FROM procurements WHERE id = $1',
      [id],
    );
    const row = r.rows[0];
    if (!row) throw new DomainError('not_found', 'Edital não encontrado');
    return row;
  }

  /** Coleta itens e lista de documentos no PNCP (idempotente: só busca o que falta). */
  async collect(id: string): Promise<void> {
    const running = this.inflight.get(id);
    if (running) return running;
    const p = this.doCollect(id).finally(() => this.inflight.delete(id));
    this.inflight.set(id, p);
    return p;
  }

  private async doCollect(id: string): Promise<void> {
    const p = await this.proc(id);
    if (!p.items_collected_at) {
      const r = await this.api.items(p.organ_cnpj, p.year, p.sequence);
      if (!r.ok) throw this.sourceError('os itens', r.error);
      const client = await this.db.connect();
      try {
        await client.query('BEGIN');
        for (const it of r.data) {
          await client.query(
            `INSERT INTO procurement_items (procurement_id, item_number, description, quantity, unit, unit_value, total_value, kind, situation)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (procurement_id, item_number) DO UPDATE SET description = EXCLUDED.description, quantity = EXCLUDED.quantity,
               unit = EXCLUDED.unit, unit_value = EXCLUDED.unit_value, total_value = EXCLUDED.total_value, kind = EXCLUDED.kind, situation = EXCLUDED.situation`,
            [
              id,
              it.numeroItem,
              it.descricao,
              it.quantidade ?? null,
              it.unidadeMedida ?? null,
              it.valorUnitarioEstimado ?? null,
              it.valorTotal ?? null,
              it.materialOuServicoNome ?? null,
              it.situacaoCompraItemNome ?? null,
            ],
          );
        }
        await client.query('UPDATE procurements SET items_collected_at = now() WHERE id = $1', [
          id,
        ]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    }
    if (!p.documents_collected_at) {
      const r = await this.api.documents(p.organ_cnpj, p.year, p.sequence);
      if (!r.ok) throw this.sourceError('os documentos', r.error);
      const client = await this.db.connect();
      try {
        await client.query('BEGIN');
        for (const d of r.data) {
          if (d.statusAtivo === false) continue;
          await client.query(
            `INSERT INTO procurement_documents (procurement_id, sequence, title, doc_type, url)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (procurement_id, sequence) DO UPDATE SET title = EXCLUDED.title, doc_type = EXCLUDED.doc_type, url = EXCLUDED.url`,
            [
              id,
              d.sequencialDocumento,
              d.titulo || `Documento ${d.sequencialDocumento}`,
              d.tipoDocumentoNome ?? 'Documento',
              d.url,
            ],
          );
        }
        await client.query('UPDATE procurements SET documents_collected_at = now() WHERE id = $1', [
          id,
        ]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    }
  }

  private sourceError(what: string, code: string): DomainError {
    const msg =
      code === 'rate_limited'
        ? 'O PNCP limitou as consultas por agora. Tente de novo em instantes.'
        : `Não foi possível buscar ${what} no PNCP agora.`;
    return new DomainError('source_unavailable', msg, { source: 'pncp', reason: code });
  }

  async items(id: string): Promise<{ collected: boolean; list: ProcurementItem[] }> {
    const p = await this.proc(id);
    if (!p.items_collected_at) return { collected: false, list: [] };
    const r = await this.db.query<{
      item_number: number;
      description: string;
      quantity: string | null;
      unit: string | null;
      unit_value: string | null;
      total_value: string | null;
      kind: string | null;
      situation: string | null;
    }>(
      'SELECT item_number, description, quantity, unit, unit_value, total_value, kind, situation FROM procurement_items WHERE procurement_id = $1 ORDER BY item_number',
      [id],
    );
    const n = (v: string | null) => (v === null ? null : Number(v));
    return {
      collected: true,
      list: r.rows.map((x) => ({
        number: x.item_number,
        description: x.description,
        quantity: n(x.quantity),
        unit: x.unit,
        unit_value: n(x.unit_value),
        total_value: n(x.total_value),
        kind: x.kind,
        situation: x.situation,
      })),
    };
  }

  async documents(id: string): Promise<{ collected: boolean; list: ProcurementDocument[] }> {
    const p = await this.proc(id);
    if (!p.documents_collected_at) return { collected: false, list: [] };
    const r = await this.db.query<{
      sequence: number;
      title: string;
      doc_type: string;
      url: string;
      text_status: string;
      pages: number | null;
    }>(
      'SELECT sequence, title, doc_type, url, text_status, pages FROM procurement_documents WHERE procurement_id = $1 ORDER BY sequence',
      [id],
    );
    return {
      collected: true,
      list: r.rows.map((d) => ({
        sequence: d.sequence,
        title: d.title,
        type: d.doc_type,
        url: d.url,
        text_status: (DOC_TEXT_STATUS as readonly string[]).includes(d.text_status)
          ? (d.text_status as ProcurementDocument['text_status'])
          : 'failed',
        pages: d.pages,
      })),
    };
  }

  async withCollected(detail: ProcurementDetail): Promise<ProcurementDetail> {
    const [items, documents] = await Promise.all([
      this.items(detail.id),
      this.documents(detail.id),
    ]);
    return { ...detail, items, documents };
  }

  /**
   * Garante o texto (por página) dos documentos que o leitor usa. Baixa só os de prioridade (edital, termo de referência),
   * uma vez: o hash do arquivo evita reprocessar. Devolve o que ficou legível e o motivo do que não ficou.
   */
  async ensureText(id: string): Promise<{
    docs: Array<{
      id: string;
      title: string;
      pages: Array<{ label: string; page: number; text: string }>;
    }>;
    unreadable: Array<{ title: string; status: string }>;
  }> {
    await this.collect(id);
    const list = await this.db.query<{
      id: string;
      sequence: number;
      title: string;
      doc_type: string;
      url: string;
      text_status: string;
    }>(
      'SELECT id, sequence, title, doc_type, url, text_status FROM procurement_documents WHERE procurement_id = $1 ORDER BY sequence',
      [id],
    );
    const wanted = list.rows
      .filter((d) => PRIORITY.some((re) => re.test(d.doc_type) || re.test(d.title)))
      .sort(
        (a, b) =>
          PRIORITY.findIndex((re) => re.test(a.doc_type)) -
          PRIORITY.findIndex((re) => re.test(b.doc_type)),
      )
      .slice(0, 4);
    const docs: Array<{
      id: string;
      title: string;
      pages: Array<{ label: string; page: number; text: string }>;
    }> = [];
    const unreadable: Array<{ title: string; status: string }> = [];

    for (const d of wanted) {
      if (d.text_status === 'pending') {
        const dl = await this.api.download(d.url, MAX_DOWNLOAD);
        if (!dl.ok) {
          const status = dl.error === 'too_large' ? 'too_large' : 'failed';
          if (status === 'too_large')
            await this.db.query(
              "UPDATE procurement_documents SET text_status = 'too_large', processed_at = now() WHERE id = $1",
              [d.id],
            );
          unreadable.push({ title: d.title, status });
          continue;
        }
        const hash = createHash('sha256').update(dl.data.bytes).digest('hex');
        const ex = await extractPages(dl.data.bytes, d.title);
        const client = await this.db.connect();
        try {
          await client.query('BEGIN');
          await client.query('DELETE FROM document_pages WHERE document_id = $1', [d.id]);
          let idx = 0;
          for (const pg of ex.pages) {
            await client.query(
              'INSERT INTO document_pages (document_id, idx, label, page, text) VALUES ($1,$2,$3,$4,$5)',
              [d.id, idx++, pg.label, pg.page, pg.text],
            );
          }
          await client.query(
            'UPDATE procurement_documents SET text_status = $2, pages = $3, file_hash = $4, processed_at = now() WHERE id = $1',
            [d.id, ex.status, ex.pages.length || null, hash],
          );
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw e;
        } finally {
          client.release();
        }
        d.text_status = ex.status;
      }
      if (d.text_status === 'ok') {
        const pg = await this.db.query<{ label: string; page: number; text: string }>(
          'SELECT label, page, text FROM document_pages WHERE document_id = $1 ORDER BY idx',
          [d.id],
        );
        docs.push({ id: d.id, title: d.title, pages: pg.rows });
      } else {
        unreadable.push({ title: d.title, status: d.text_status });
      }
    }
    return { docs, unreadable };
  }
}
