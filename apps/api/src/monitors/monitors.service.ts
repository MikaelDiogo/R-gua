import {
  type AlertItem,
  type AlertsResponse,
  CreateMonitor,
  MarkAlertsRead,
  type Monitor,
  type MonitorDetail,
  type MonitorIntent,
  type MonitorList,
  type RunMonitorResponse,
  SearchIntent,
  UpdateMonitor,
} from '@agora/contracts';
import { type Db, withUser } from '@agora/db';
import { Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { type Clock, InjectClock, InjectDb } from '../platform/db.module';
import { DomainError } from '../platform/problem.filter';
import { SUMMARY_COLUMNS, type SummaryRow, toSummary } from '../platform/serialize';
import { SearchService } from '../search/search.service';

const ID = /^[0-9a-f-]{36}$/i;
const SCHEDULER_EVERY_MS = 10 * 60_000;

interface MonitorRow {
  id: string;
  name: string;
  intent: MonitorIntent;
  frequency: 'immediate' | 'daily';
  channels: Array<'app'>;
  active: boolean;
  last_run_at: Date | null;
  last_change_id: string;
  version: number;
  created_at: Date;
  updated_at: Date;
  unread: string;
}

const MONITOR_SELECT = `SELECT m.*, (SELECT count(*) FROM monitor_hits h WHERE h.monitor_id = m.id AND h.kind <> 'baseline' AND h.read_at IS NULL) AS unread FROM monitors m`;

/** Monitor → busca. Sem status explícito, só interessa o que ainda está aberto para propostas. */
export function toSearchIntent(i: MonitorIntent, page = 1, limit = 20): SearchIntent {
  const filters = {
    ...i.filters,
    status: i.filters.status?.length ? i.filters.status : (['open_for_proposals'] as const),
  };
  return SearchIntent.parse({
    q: i.q || undefined,
    filters,
    sort: i.sort,
    page,
    limit,
    facets: [],
  });
}

const FIELD_LABEL: Record<string, string> = {
  proposals_close_at: 'Prazo de propostas alterado',
  status: 'Situação alterada',
  estimated_value: 'Valor estimado alterado',
};
export const changeText = (fields: string[]) =>
  fields.map((f) => FIELD_LABEL[f] ?? `${f} alterado`).join('; ');

@Injectable()
export class MonitorsService {
  private readonly log = new Logger('Monitores');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectDb() private readonly db: Db,
    @InjectClock() private readonly clock: Clock,
    private readonly search: SearchService,
  ) {}

  private view(r: MonitorRow): Monitor {
    return {
      id: r.id,
      name: r.name,
      intent: r.intent,
      frequency: r.frequency,
      channels: r.channels,
      active: r.active,
      last_run_at: r.last_run_at?.toISOString() ?? null,
      unread: Number(r.unread),
      version: r.version,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
    };
  }

  private async load(c: PoolClient, id: string): Promise<MonitorRow> {
    if (!ID.test(id)) throw new DomainError('not_found', 'Monitor não encontrado');
    const r = await c.query<MonitorRow>(`${MONITOR_SELECT} WHERE m.id = $1`, [id]);
    const row = r.rows[0];
    if (!row) throw new DomainError('not_found', 'Monitor não encontrado');
    return row;
  }

  async list(userId: string): Promise<MonitorList> {
    const rows = await withUser(
      this.db,
      userId,
      async (c) => (await c.query<MonitorRow>(`${MONITOR_SELECT} ORDER BY m.created_at DESC`)).rows,
    );
    return { items: rows.map((r) => this.view(r)), server_now: this.clock().toISOString() };
  }

  async create(userId: string, body: unknown): Promise<Monitor> {
    const cmd = CreateMonitor.parse(body);
    const ids = await this.search.matchIds(toSearchIntent(cmd.intent));
    return withUser(this.db, userId, async (c) => {
      const n = await c.query<{ n: string }>('SELECT count(*) AS n FROM monitors');
      if (Number(n.rows[0]?.n ?? 0) >= 50)
        throw new DomainError(
          'quota_exceeded',
          'Limite de 50 monitores atingido. Exclua algum para criar outro.',
        );
      const mark = await c.query<{ m: string | null }>(
        'SELECT max(id) AS m FROM procurement_changes',
      );
      const ins = await c.query<{ id: string }>(
        `INSERT INTO monitors (user_id, name, intent, frequency, channels, active, last_run_at, last_change_id)
         VALUES ($1,$2,$3,$4,$5,$6, now(), $7) RETURNING id`,
        [
          userId,
          cmd.name,
          JSON.stringify(cmd.intent),
          cmd.frequency,
          cmd.channels,
          cmd.active,
          mark.rows[0]?.m ?? 0,
        ],
      );
      const id = (ins.rows[0] as { id: string }).id;
      // O que já casa hoje entra como "visto": o alerta é só para o que aparecer depois.
      if (ids.length > 0) {
        await c.query(
          `INSERT INTO monitor_hits (user_id, monitor_id, procurement_id, kind, read_at)
           SELECT $1, $2, x, 'baseline', now() FROM unnest($3::uuid[]) AS x ON CONFLICT DO NOTHING`,
          [userId, id, ids],
        );
      }
      return this.view(await this.load(c, id));
    });
  }

  /** Monitores fixos de cada usuário (pedido do dono): assessoria jurídica em LGPD, todos os estados. Criado uma vez, no login. */
  async ensureDefaults(userId: string): Promise<void> {
    const NAME = 'Assessoria jurídica em LGPD (automático)';
    const exists = await withUser(
      this.db,
      userId,
      async (c) => (await c.query('SELECT 1 FROM monitors WHERE name = $1', [NAME])).rowCount,
    );
    if (exists) return;
    await this.create(userId, {
      name: NAME,
      intent: { q: '"proteção de dados" or lgpd', filters: {}, sort: 'published_desc' },
      frequency: 'immediate',
      channels: ['app'],
      active: true,
    });
  }

  async update(
    userId: string,
    id: string,
    body: unknown,
    ifMatch: string | undefined,
  ): Promise<Monitor> {
    const cmd = UpdateMonitor.parse(body);
    const version = Number((ifMatch ?? '').replace(/["W/]/g, ''));
    if (!Number.isInteger(version) || version < 1)
      throw new DomainError('validation_failed', 'Cabeçalho If-Match com a versão é obrigatório');
    return withUser(this.db, userId, async (c) => {
      const cur = await this.load(c, id);
      if (cur.version !== version) {
        throw new DomainError(
          'version_conflict',
          'O monitor foi alterado em outra aba. Veja o estado atual.',
          { current: this.view(cur) },
        );
      }
      await c.query(
        `UPDATE monitors SET name = $2, intent = $3, frequency = $4, channels = $5, active = $6, version = version + 1, updated_at = now() WHERE id = $1`,
        [
          id,
          cmd.name ?? cur.name,
          JSON.stringify(cmd.intent ?? cur.intent),
          cmd.frequency ?? cur.frequency,
          cmd.channels ?? cur.channels,
          cmd.active ?? cur.active,
        ],
      );
      // Mudou o que procura: o que já casa agora vira "visto", para não alertar de uma vez tudo da busca nova.
      if (cmd.intent) {
        const ids = await this.search.matchIds(toSearchIntent(cmd.intent));
        if (ids.length > 0) {
          await c.query(
            `INSERT INTO monitor_hits (user_id, monitor_id, procurement_id, kind, read_at)
             SELECT $1, $2, x, 'baseline', now() FROM unnest($3::uuid[]) AS x ON CONFLICT DO NOTHING`,
            [userId, id, ids],
          );
        }
      }
      return this.view(await this.load(c, id));
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await withUser(this.db, userId, async (c) => {
      await this.load(c, id);
      await c.query('DELETE FROM monitors WHERE id = $1', [id]);
    });
  }

  private alertFrom(
    r: SummaryRow & {
      hit_id: string;
      monitor_id: string;
      monitor_name: string;
      kind: 'new' | 'changed';
      change: string | null;
      hit_created_at: Date;
      read_at: Date | null;
    },
  ): AlertItem {
    return {
      id: r.hit_id,
      monitor_id: r.monitor_id,
      monitor_name: r.monitor_name,
      kind: r.kind,
      change: r.change,
      created_at: r.hit_created_at.toISOString(),
      read_at: r.read_at?.toISOString() ?? null,
      procurement: toSummary(r, this.clock()),
    };
  }

  private static readonly ALERT_SELECT =
    `SELECT h.id AS hit_id, h.monitor_id, m.name AS monitor_name, h.kind, h.change, h.created_at AS hit_created_at, h.read_at, ${SUMMARY_COLUMNS}
    FROM monitor_hits h JOIN monitors m ON m.id = h.monitor_id JOIN procurements p ON p.id = h.procurement_id JOIN organs o ON o.cnpj = p.organ_cnpj`;

  async detail(userId: string, id: string, page: number, limit: number): Promise<MonitorDetail> {
    const monitor = await withUser(this.db, userId, async (c) => this.view(await this.load(c, id)));
    const unread = await withUser(
      this.db,
      userId,
      async (c) =>
        (
          await c.query(
            `${MonitorsService.ALERT_SELECT} WHERE h.monitor_id = $1 AND h.kind <> 'baseline' AND h.read_at IS NULL ORDER BY h.created_at DESC LIMIT 50`,
            [id],
          )
        ).rows,
    );
    const matches = await this.search.search(toSearchIntent(monitor.intent, page, limit));
    return {
      monitor,
      unread_alerts: unread.map((r) => this.alertFrom(r as never)),
      matches,
      server_now: this.clock().toISOString(),
    };
  }

  async alerts(
    userId: string,
    opts: { unread: boolean; monitorId?: string; page: number; limit: number },
  ): Promise<AlertsResponse> {
    const offset = (opts.page - 1) * opts.limit;
    return withUser(this.db, userId, async (c) => {
      const params: unknown[] = [];
      const where = [`h.kind <> 'baseline'`];
      if (opts.unread) where.push('h.read_at IS NULL');
      if (opts.monitorId && ID.test(opts.monitorId)) {
        params.push(opts.monitorId);
        where.push(`h.monitor_id = $${params.length}`);
      }
      const w = where.join(' AND ');
      const list = await c.query(
        `${MonitorsService.ALERT_SELECT} WHERE ${w} ORDER BY h.created_at DESC LIMIT ${opts.limit} OFFSET ${offset}`,
        params,
      );
      const total = await c.query<{ n: string }>(
        `SELECT count(*) AS n FROM monitor_hits h WHERE ${w}`,
        params,
      );
      const unread = await c.query<{ n: string }>(
        `SELECT count(*) AS n FROM monitor_hits WHERE kind <> 'baseline' AND read_at IS NULL`,
      );
      return {
        items: list.rows.map((r) => this.alertFrom(r as never)),
        unread_total: Number(unread.rows[0]?.n ?? 0),
        page: opts.page,
        page_size: opts.limit,
        total: Number(total.rows[0]?.n ?? 0),
        server_now: this.clock().toISOString(),
      };
    });
  }

  async markRead(
    userId: string,
    body: unknown,
  ): Promise<{ unread_total: number; server_now: string }> {
    const cmd = MarkAlertsRead.parse(body);
    return withUser(this.db, userId, async (c) => {
      if (cmd.all)
        await c.query(
          "UPDATE monitor_hits SET read_at = now() WHERE read_at IS NULL AND kind <> 'baseline'",
        );
      else if (cmd.ids?.length)
        await c.query(
          'UPDATE monitor_hits SET read_at = now() WHERE read_at IS NULL AND id = ANY($1::uuid[])',
          [cmd.ids],
        );
      const n = await c.query<{ n: string }>(
        "SELECT count(*) AS n FROM monitor_hits WHERE kind <> 'baseline' AND read_at IS NULL",
      );
      return { unread_total: Number(n.rows[0]?.n ?? 0), server_now: this.clock().toISOString() };
    });
  }

  /** Executa o monitor: o que casa e ainda não foi visto vira alerta "novo"; mudanças em editais acompanhados viram "alterado". */
  async run(userId: string, id: string): Promise<RunMonitorResponse> {
    const mon = await withUser(this.db, userId, (c) => this.load(c, id));
    const ids = await this.search.matchIds(toSearchIntent(mon.intent));
    return withUser(this.db, userId, async (c) => {
      const fresh = await c.query<{ n: string }>(
        `WITH ins AS (
           INSERT INTO monitor_hits (user_id, monitor_id, procurement_id, kind)
           SELECT $1, $2, x, 'new' FROM unnest($3::uuid[]) AS x ON CONFLICT DO NOTHING RETURNING 1
         ) SELECT count(*) AS n FROM ins`,
        [userId, id, ids],
      );
      // Mudanças em editais que o monitor acompanha (os que casam agora ou já geraram alerta).
      const changed = await c.query<{ n: string; max_id: string | null }>(
        `WITH tracked AS (
           SELECT x AS procurement_id FROM unnest($3::uuid[]) AS x
           UNION SELECT procurement_id FROM monitor_hits WHERE monitor_id = $2
         ), ch AS (
           SELECT pc.id, pc.procurement_id, pc.fields FROM procurement_changes pc
           JOIN tracked t ON t.procurement_id = pc.procurement_id WHERE pc.id > $4
         ), ins AS (
           INSERT INTO monitor_hits (user_id, monitor_id, procurement_id, kind, change_id, change)
           SELECT $1, $2, ch.procurement_id, 'changed', ch.id,
             (SELECT string_agg(CASE f WHEN 'proposals_close_at' THEN 'Prazo de propostas alterado' WHEN 'status' THEN 'Situação alterada' WHEN 'estimated_value' THEN 'Valor estimado alterado' ELSE f || ' alterado' END, '; ') FROM unnest(ch.fields) AS f)
           FROM ch ON CONFLICT DO NOTHING RETURNING 1
         ) SELECT (SELECT count(*) FROM ins) AS n, (SELECT max(id) FROM procurement_changes) AS max_id`,
        [userId, id, ids, mon.last_change_id],
      );
      await c.query(
        'UPDATE monitors SET last_run_at = now(), last_change_id = GREATEST(last_change_id, $2::bigint) WHERE id = $1',
        [id, changed.rows[0]?.max_id ?? 0],
      );
      return {
        new_count: Number(fresh.rows[0]?.n ?? 0),
        changed_count: Number(changed.rows[0]?.n ?? 0),
        monitor: this.view(await this.load(c, id)),
        server_now: this.clock().toISOString(),
      };
    });
  }

  /** Roda todos os monitores ativos de todos os usuários (diários só se passou 1 dia). Cada falha é isolada e registrada. */
  async runDue(): Promise<{ ran: number; failed: number }> {
    const users = await this.db.query<{ id: string }>('SELECT id FROM users');
    let ran = 0;
    let failed = 0;
    for (const u of users.rows) {
      const due = await withUser(
        this.db,
        u.id,
        async (c) =>
          (
            await c.query<{ id: string }>(
              `SELECT id FROM monitors WHERE active AND (frequency = 'immediate' OR last_run_at IS NULL OR last_run_at < now() - interval '1 day')`,
            )
          ).rows,
      );
      for (const m of due) {
        try {
          await this.run(u.id, m.id);
          ran++;
        } catch (e) {
          failed++;
          this.log.error(`monitor ${m.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    return { ran, failed };
  }

  /** Agendador simples dentro da API (a cada 10 min). Quando houver fila (BullMQ), este laço vira um job. */
  startScheduler(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runDue().then(
        (r) =>
          r.ran + r.failed > 0 &&
          this.log.log(`monitores executados: ${r.ran}, falhas: ${r.failed}`),
        (e) => this.log.error(String(e)),
      );
    }, SCHEDULER_EVERY_MS);
    this.timer.unref();
  }
}
