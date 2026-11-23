import { createHash } from 'node:crypto';
import {
  type CreateCardCommand,
  type MoveCardCommand,
  type PipelineCard,
  type PipelineResponse,
  type PipelineState,
  type UpdateCardCommand,
} from '@agora/contracts';
import { type Db, withUser } from '@agora/db';
import { canTransition, PIPELINE_COLUMNS } from '@agora/domain';
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { z } from 'zod';
import { type Clock, InjectClock, InjectDb } from '../platform/db.module';
import { DomainError } from '../platform/problem.filter';
import { SUMMARY_COLUMNS, type SummaryRow, toSummary } from '../platform/serialize';

/**
 * Modo desenvolvimento: organização e papel fixos, sem login. Quando houver identidade, ambos vêm do token
 * (docs/04 §2); nada aqui lê organização do corpo ou de cabeçalho do cliente.
 */
const ROLE = 'owner' as const;

interface CardRow extends SummaryRow {
  card_id: string;
  card_state: PipelineState;
  assignee: string | null;
  notes: string | null;
  version: number;
  card_created_at: Date;
  card_updated_at: Date;
}

const CARD_SELECT = `SELECT c.id AS card_id, c.state AS card_state, c.assignee, c.notes, c.version,
    c.created_at AS card_created_at, c.updated_at AS card_updated_at, ${SUMMARY_COLUMNS}
  FROM pipeline_cards c JOIN procurements p ON p.id = c.procurement_id JOIN organs o ON o.cnpj = p.organ_cnpj`;

@Injectable()
export class PipelineService {
  constructor(
    @InjectDb() private readonly db: Db,
    @InjectClock() private readonly clock: Clock,
  ) {}

  private toCard(r: CardRow): PipelineCard {
    return {
      id: r.card_id,
      procurement: toSummary(r, this.clock()),
      state: r.card_state,
      assignee: r.assignee,
      notes: r.notes,
      version: r.version,
      created_at: r.card_created_at.toISOString(),
      updated_at: r.card_updated_at.toISOString(),
    };
  }

  private async loadCard(c: PoolClient, id: string): Promise<PipelineCard | null> {
    const r = await c.query<CardRow>(`${CARD_SELECT} WHERE c.id = $1`, [id]);
    return r.rows[0] ? this.toCard(r.rows[0]) : null;
  }

  async list(userId: string): Promise<PipelineResponse> {
    return withUser(this.db, userId, async (c) => {
      const r = await c.query<CardRow>(`${CARD_SELECT} ORDER BY c.updated_at DESC`);
      return {
        columns: PIPELINE_COLUMNS,
        cards: r.rows.map((x) => this.toCard(x)),
        server_now: this.clock().toISOString(),
      };
    });
  }

  /**
   * Idempotência (docs/04 §2): a mesma chave com o mesmo corpo devolve a MESMA resposta sem repetir o efeito;
   * a mesma chave com corpo diferente é `idempotency_mismatch`.
   */
  private async idempotent<T>(
    c: PoolClient,
    userId: string,
    key: string | undefined,
    body: unknown,
    run: () => Promise<T>,
  ): Promise<T> {
    if (!key || !/^[0-9a-f-]{36}$/i.test(key)) {
      throw new DomainError('validation_failed', 'Cabeçalho Idempotency-Key (UUID) é obrigatório');
    }
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const prev = await c.query<{ request_hash: string; response: T | null }>(
      'SELECT request_hash, response FROM idempotency_keys WHERE key = $1',
      [key],
    );
    const hit = prev.rows[0];
    if (hit) {
      if (hit.request_hash !== hash) {
        throw new DomainError(
          'idempotency_mismatch',
          'A mesma Idempotency-Key foi usada com outro corpo',
        );
      }
      if (hit.response !== null) return hit.response;
    }
    const out = await run();
    await c.query(
      `INSERT INTO idempotency_keys (user_id, key, request_hash, response) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, key) DO NOTHING`,
      [userId, key, hash, JSON.stringify(out)],
    );
    return out;
  }

  async create(
    userId: string,
    cmd: z.infer<typeof CreateCardCommand>,
    idemKey: string | undefined,
  ): Promise<PipelineCard> {
    return withUser(this.db, userId, (c) =>
      this.idempotent(c, userId, idemKey, cmd, async () => {
        const proc = await c.query('SELECT 1 FROM procurements WHERE id = $1', [
          cmd.procurement_id,
        ]);
        if (proc.rowCount === 0) throw new DomainError('not_found', 'Edital não encontrado');
        const dup = await c.query<{ id: string }>(
          'SELECT id FROM pipeline_cards WHERE procurement_id = $1',
          [cmd.procurement_id],
        );
        const existing = dup.rows[0];
        if (existing) return (await this.loadCard(c, existing.id)) as PipelineCard; // já está no pipeline: devolve o card
        const ins = await c.query<{ id: string }>(
          `INSERT INTO pipeline_cards (user_id, procurement_id, state) VALUES ($1,$2,'descoberto') RETURNING id`,
          [userId, cmd.procurement_id],
        );
        const id = ins.rows[0]?.id as string;
        await c.query(
          `INSERT INTO audit_log (user_id, actor, action, target_type, target_id, after) VALUES ($1,'dev','card.created','pipeline_card',$2,$3)`,
          [userId, id, JSON.stringify({ procurement_id: cmd.procurement_id })],
        );
        return (await this.loadCard(c, id)) as PipelineCard;
      }),
    );
  }

  private parseVersion(ifMatch: string | undefined): number {
    const v = Number((ifMatch ?? '').replace(/["W/]/g, ''));
    if (!Number.isInteger(v) || v < 1) {
      throw new DomainError(
        'validation_failed',
        'Cabeçalho If-Match com a versão do card é obrigatório',
      );
    }
    return v;
  }

  async move(
    userId: string,
    id: string,
    cmd: z.infer<typeof MoveCardCommand>,
    ifMatch: string | undefined,
    idemKey: string | undefined,
  ): Promise<PipelineCard> {
    const version = this.parseVersion(ifMatch);
    return withUser(this.db, userId, (c) =>
      this.idempotent(c, userId, idemKey, { id, cmd, version }, async () => {
        // Trava a linha: duas transições simultâneas serializam, uma vence e a outra recebe 409.
        const cur = await c.query<{ state: PipelineState; version: number }>(
          'SELECT state, version FROM pipeline_cards WHERE id = $1 FOR UPDATE',
          [id],
        );
        const row = cur.rows[0];
        if (!row) throw new DomainError('not_found', 'Card não encontrado');
        if (row.version !== version) {
          const current = await this.loadCard(c, id);
          throw new DomainError(
            'version_conflict',
            'O card foi alterado por outra pessoa. Veja o estado atual.',
            { current },
          );
        }
        const verdict = canTransition(row.state, cmd.to_state, ROLE);
        if (!verdict.ok) {
          throw new DomainError('invalid_transition', verdict.reason, {
            from: row.state,
            to: cmd.to_state,
          });
        }
        await c.query(
          'UPDATE pipeline_cards SET state = $2, version = version + 1, updated_at = now() WHERE id = $1',
          [id, cmd.to_state],
        );
        await c.query(
          `INSERT INTO audit_log (user_id, actor, action, target_type, target_id, before, after)
           VALUES ($1,'dev','card.moved','pipeline_card',$2,$3,$4)`,
          [
            userId,
            id,
            JSON.stringify({ state: row.state }),
            JSON.stringify({ state: cmd.to_state }),
          ],
        );
        return (await this.loadCard(c, id)) as PipelineCard;
      }),
    );
  }

  async update(
    userId: string,
    id: string,
    cmd: z.infer<typeof UpdateCardCommand>,
    ifMatch: string | undefined,
  ): Promise<PipelineCard> {
    const version = this.parseVersion(ifMatch);
    return withUser(this.db, userId, async (c) => {
      const cur = await c.query<{ version: number }>(
        'SELECT version FROM pipeline_cards WHERE id = $1 FOR UPDATE',
        [id],
      );
      const row = cur.rows[0];
      if (!row) throw new DomainError('not_found', 'Card não encontrado');
      if (row.version !== version) {
        throw new DomainError(
          'version_conflict',
          'O card foi alterado por outra pessoa. Veja o estado atual.',
          {
            current: await this.loadCard(c, id),
          },
        );
      }
      await c.query(
        `UPDATE pipeline_cards SET
           assignee = CASE WHEN $2::boolean THEN $3 ELSE assignee END,
           notes = CASE WHEN $4::boolean THEN $5 ELSE notes END,
           version = version + 1, updated_at = now()
         WHERE id = $1`,
        [
          id,
          cmd.assignee !== undefined,
          cmd.assignee ?? null,
          cmd.notes !== undefined,
          cmd.notes ?? null,
        ],
      );
      return (await this.loadCard(c, id)) as PipelineCard;
    });
  }
}
