import { ALLOWED_UFS, type DashboardResponse } from '@agora/contracts';
import { type Db, withUser } from '@agora/db';
import { Controller, Get } from '@nestjs/common';
import { UserId } from '../auth/auth.guard';
import { type Clock, InjectClock, InjectDb } from '../platform/db.module';
import { SUMMARY_COLUMNS, type SummaryRow, toSummary } from '../platform/serialize';

const TZ = 'America/Sao_Paulo';
/** O produto cobre só estas UFs: o painel nunca conta nem lista editais de fora (como a busca). */
const COVERED = [...ALLOWED_UFS];

@Controller('v1')
export class DashboardController {
  constructor(
    @InjectDb() private readonly db: Db,
    @InjectClock() private readonly clock: Clock,
  ) {}

  /** Tudo calculado no servidor sobre o que foi coletado; `coverage` diz quanto da base temos (sem fingir cobertura total). */
  @Get('dashboard')
  async dashboard(@UserId() userId: string): Promise<DashboardResponse> {
    const now = this.clock();
    const [counts, weeks, soon, cover, fresh, funnel] = await Promise.all([
      this.db.query<{ published_today: string; open_total: string; closing_7: string }>(
        `SELECT
           count(*) FILTER (WHERE (published_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date) AS published_today,
           count(*) FILTER (WHERE status = 'open_for_proposals' AND proposals_close_at > now()) AS open_total,
           count(*) FILTER (WHERE status = 'open_for_proposals' AND proposals_close_at > now()
                              AND proposals_close_at <= now() + interval '7 days') AS closing_7
         FROM procurements WHERE uf = ANY($1)`,
        [COVERED],
      ),
      this.db.query<{ week_start: string; n: string }>(
        `SELECT to_char(date_trunc('week', proposals_close_at AT TIME ZONE '${TZ}'), 'YYYY-MM-DD') AS week_start, count(*) AS n
         FROM procurements
         WHERE uf = ANY($1) AND status = 'open_for_proposals' AND proposals_close_at > now() AND proposals_close_at < now() + interval '6 weeks'
         GROUP BY 1 ORDER BY 1`,
        [COVERED],
      ),
      this.db.query<SummaryRow>(
        `SELECT ${SUMMARY_COLUMNS} FROM procurements p JOIN organs o ON o.cnpj = p.organ_cnpj
         WHERE p.uf = ANY($1) AND p.status = 'open_for_proposals' AND p.proposals_close_at > now()
         ORDER BY p.proposals_close_at ASC, p.id LIMIT 6`,
        [COVERED],
      ),
      this.db.query<{ n: string; oldest: Date | null }>(
        'SELECT count(*) AS n, min(published_at) AS oldest FROM procurements WHERE uf = ANY($1)',
        [COVERED],
      ),
      this.db.query<{ at: Date | null }>(
        'SELECT max(updated_at) AS at FROM procurements WHERE uf = ANY($1)',
        [COVERED],
      ),
      withUser(this.db, userId, (c) =>
        c.query<{ total: string | null }>(
          `SELECT sum(p.estimated_value) AS total FROM pipeline_cards k JOIN procurements p ON p.id = k.procurement_id
           WHERE k.state IN ('em_preparacao','proposta_enviada','em_disputa')`,
        ),
      ),
    ]);
    const c = counts.rows[0];
    return {
      published_today: Number(c?.published_today ?? 0),
      open_total: Number(c?.open_total ?? 0),
      closing_in_7_days: Number(c?.closing_7 ?? 0),
      proposals_value: funnel.rows[0]?.total == null ? null : Number(funnel.rows[0].total),
      closing_by_week: weeks.rows.map((w) => ({ week_start: w.week_start, count: Number(w.n) })),
      closing_soon: soon.rows.map((r) => toSummary(r, now)),
      index_freshness_at: fresh.rows[0]?.at?.toISOString() ?? null,
      coverage: {
        procurements_stored: Number(cover.rows[0]?.n ?? 0),
        oldest_published_at: cover.rows[0]?.oldest?.toISOString() ?? null,
      },
      server_now: now.toISOString(),
    };
  }
}
