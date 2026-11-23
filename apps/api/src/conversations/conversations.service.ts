import { randomUUID } from 'node:crypto';
import {
  type AiSearchRequest,
  type AiSearchResponse,
  type AiSearchResult,
  type ConversationDetail,
  type ConversationMessage,
  type ConversationSummary,
  ConversationsQuery,
  type ConversationsResponse,
  RenameConversationRequest,
} from '@agora/contracts';
import { type Db, withUser } from '@agora/db';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDb } from '../platform/db.module';
import { DomainError } from '../platform/problem.filter';

/** Conversas guardadas por usuário. As mais velhas saem, para o histórico não crescer sem limite. */
export const MAX_CONVERSATIONS = 500;
/** Teto da resposta guardada (a tabela também confere, ver migration 0007). */
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const TITLE_MAX = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = () => new DomainError('not_found', 'Conversa não encontrada.');

/** Id malformado é "não achei": nunca um erro de banco (500) nem um 422 que ensine o formato. */
const assertId = (id: string) => {
  if (!UUID_RE.test(id)) throw notFound();
};

interface SummaryRow {
  id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
  message_count: string;
  /** updated_at com microssegundos, para o cursor não pular nem repetir linhas. */
  cursor_t: string;
}

const toSummary = (r: SummaryRow): ConversationSummary => ({
  id: r.id,
  title: r.title,
  created_at: r.created_at.toISOString(),
  updated_at: r.updated_at.toISOString(),
  message_count: Number(r.message_count),
});

const SUMMARY_SQL = `
  SELECT c.id, c.title, c.created_at, c.updated_at,
         to_char(c.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_t,
         (SELECT count(*) FROM conversation_messages m WHERE m.conversation_id = c.id) AS message_count
  FROM conversations c`;

/** Título da conversa nova: o começo do primeiro pedido, numa linha só. */
export function titleFrom(prompt: string): string {
  const t = prompt.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX).trimEnd();
  return t || 'Nova conversa';
}

export function encodeCursor(t: string, id: string): string {
  return Buffer.from(JSON.stringify({ t, i: id }), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): { t: string; i: string } {
  try {
    const v = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      t?: unknown;
      i?: unknown;
    };
    if (
      typeof v.t === 'string' &&
      typeof v.i === 'string' &&
      UUID_RE.test(v.i) &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,6}Z$/.test(v.t)
    )
      return { t: v.t, i: v.i };
  } catch {
    // cai no erro abaixo
  }
  throw new DomainError('validation_failed', 'Cursor inválido.');
}

@Injectable()
export class ConversationsService {
  private readonly log = new Logger('Conversations');

  constructor(@InjectDb() private readonly db: Db) {}

  async list(userId: string, rawQuery: unknown): Promise<ConversationsResponse> {
    const q = ConversationsQuery.parse(rawQuery ?? {});
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.q) {
      params.push(q.q.replace(/[\\%_]/g, (m) => `\\${m}`));
      where.push(
        `immutable_unaccent(c.title) ILIKE '%' || immutable_unaccent($${params.length}) || '%'`,
      );
    }
    if (q.cursor) {
      const cur = decodeCursor(q.cursor);
      params.push(cur.t, cur.i);
      where.push(
        `(c.updated_at, c.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`,
      );
    }
    params.push(q.limit + 1);
    const sql = `${SUMMARY_SQL}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY c.updated_at DESC, c.id DESC LIMIT $${params.length}`;
    const rows = await withUser(this.db, userId, (c) => c.query<SummaryRow>(sql, params));
    const page = rows.rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      items: page.map(toSummary),
      next_cursor: rows.rows.length > q.limit && last ? encodeCursor(last.cursor_t, last.id) : null,
    };
  }

  async get(userId: string, id: string): Promise<ConversationDetail> {
    assertId(id);
    return withUser(this.db, userId, async (c) => {
      const head = await c.query<SummaryRow>(`${SUMMARY_SQL} WHERE c.id = $1`, [id]);
      if (!head.rows[0]) throw notFound();
      const msgs = await c.query<{
        id: string;
        role: 'user' | 'assistant';
        prompt: string | null;
        sources: { pncp: boolean; web: boolean } | null;
        scope: 'open' | 'all' | null;
        response: AiSearchResponse | null;
        created_at: Date;
      }>(
        `SELECT id, role, prompt, sources, scope, response, created_at
         FROM conversation_messages WHERE conversation_id = $1 ORDER BY created_at, id`,
        [id],
      );
      const messages: ConversationMessage[] = msgs.rows.map((m) => ({
        id: m.id,
        role: m.role,
        prompt: m.prompt,
        sources: m.sources,
        scope: m.scope,
        response: m.response,
        created_at: m.created_at.toISOString(),
      }));
      return { conversation: toSummary(head.rows[0]), messages };
    });
  }

  /** Renomear não muda a ordem da lista (updated_at fica como está). */
  async rename(userId: string, id: string, body: unknown): Promise<ConversationSummary> {
    assertId(id);
    const req = RenameConversationRequest.parse(body ?? {});
    return withUser(this.db, userId, async (c) => {
      const r = await c.query('UPDATE conversations SET title = $2 WHERE id = $1', [id, req.title]);
      if (r.rowCount === 0) throw notFound();
      const s = await c.query<SummaryRow>(`${SUMMARY_SQL} WHERE c.id = $1`, [id]);
      if (!s.rows[0]) throw notFound();
      return toSummary(s.rows[0]);
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    assertId(id);
    const r = await withUser(this.db, userId, (c) =>
      c.query('DELETE FROM conversations WHERE id = $1', [id]),
    );
    if (r.rowCount === 0) throw notFound();
  }

  /** Confere antes da busca (cara) que a conversa informada existe e é do usuário. */
  async assertOwned(userId: string, id: string): Promise<void> {
    assertId(id);
    const r = await withUser(this.db, userId, (c) =>
      c.query('SELECT 1 FROM conversations WHERE id = $1', [id]),
    );
    if (r.rowCount === 0) throw notFound();
  }

  /**
   * Guarda o pedido e a resposta (uma transação) e devolve a resposta ligada à conversa. NUNCA derruba a busca:
   * se gravar falhar, devolve a resposta mesmo assim, marcada com `history_not_saved` (e, numa conversa nova,
   * com um id que não existe: o cliente não deve reaproveitá-lo). O log não leva texto do usuário.
   */
  async saveExchange(
    userId: string,
    req: AiSearchRequest,
    result: AiSearchResult,
  ): Promise<AiSearchResponse> {
    try {
      return await withUser(this.db, userId, async (c) => {
        let conversationId = req.conversation_id;
        if (conversationId) {
          const own = await c.query('SELECT 1 FROM conversations WHERE id = $1', [conversationId]);
          if (own.rowCount === 0) throw notFound();
        } else {
          const ins = await c.query<{ id: string }>(
            'INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id',
            [userId, titleFrom(req.prompt)],
          );
          conversationId = ins.rows[0]?.id;
          if (!conversationId) throw new Error('conversa não criada');
        }
        const response: AiSearchResponse = { ...result, conversation_id: conversationId };
        const json = JSON.stringify(response);
        if (Buffer.byteLength(json, 'utf8') > MAX_RESPONSE_BYTES)
          throw new Error('resposta grande demais');
        // clock_timestamp() (e não now()) mantém a ordem: pedido antes da resposta, na mesma transação.
        await c.query(
          `INSERT INTO conversation_messages (conversation_id, user_id, role, prompt, sources, scope, created_at)
           VALUES ($1, $2, 'user', $3, $4::jsonb, $5, clock_timestamp())`,
          [conversationId, userId, req.prompt, JSON.stringify(req.sources), req.scope],
        );
        await c.query(
          `INSERT INTO conversation_messages (conversation_id, user_id, role, response, created_at)
           VALUES ($1, $2, 'assistant', $3::jsonb, clock_timestamp())`,
          [conversationId, userId, json],
        );
        await c.query('UPDATE conversations SET updated_at = clock_timestamp() WHERE id = $1', [
          conversationId,
        ]);
        // Limite por usuário: as mais antigas saem na mesma transação.
        await c.query(
          `DELETE FROM conversations WHERE id IN (
             SELECT id FROM conversations WHERE user_id = $1
             ORDER BY updated_at DESC, id DESC OFFSET $2)`,
          [userId, MAX_CONVERSATIONS],
        );
        return response;
      });
    } catch (e) {
      const code =
        typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
      this.log.error(
        `histórico não gravado (${e instanceof Error ? e.constructor.name : 'erro'} ${code})`,
      );
      return {
        ...result,
        conversation_id: req.conversation_id ?? randomUUID(),
        meta: { ...result.meta, degraded: [...result.meta.degraded, 'history_not_saved'] },
      };
    }
  }
}
