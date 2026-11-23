import {
  type ProcurementSummary,
  type RadarForYouItem,
  type RadarForYouResponse,
  type RadarInterest,
  SearchIntent,
} from '@agora/contracts';
import { type Db, withUser } from '@agora/db';
import { Injectable, Logger } from '@nestjs/common';
import { type Clock, InjectClock, InjectDb } from '../platform/db.module';
import { SearchService } from '../search/search.service';
import { buildInterests, type ChatRow, type Interest, type MonitorRow } from './interests';

const MAX_ITEMS = 10;
const PER_INTEREST = 8;
/** Cada interesse tem seu tempo: um que trava não segura a tela (a busca é local, no banco). */
const INTEREST_TIMEOUT_MS = 4000;
const CHAT_CONVERSATIONS = 30;
const CHAT_MESSAGES = 100;
const MONITORS = 20;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([p, limit]).finally(() => clearTimeout(timer));
}

/**
 * "Para você" do Radar: editais ABERTOS que combinam com o que a pessoa pesquisou no chat e vigia nos monitores.
 * Tudo no servidor e só com dados da própria conta (RLS por usuário); nenhuma IA nem rede (docs/04, docs/06 §8).
 * O lugar de cada interesse é filtro estrito e nunca vaza para outro interesse.
 */
@Injectable()
export class RadarService {
  private readonly log = new Logger(RadarService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    @InjectClock() private readonly clock: Clock,
    private readonly search: SearchService,
  ) {}

  /** Lê só o que importa do histórico: a resposta da IA inteira pode ter 2 MB, então o SQL extrai o necessário. */
  private async load(userId: string): Promise<{ chat: ChatRow[]; monitors: MonitorRow[] }> {
    return withUser(this.db, userId, async (c) => {
      const chat = await c.query<ChatRow>(
        `SELECT m.conversation_id::text AS conversation_id, m.role, m.prompt,
                m.response->>'kind' AS kind,
                m.response->'understood'->'keywords' AS keywords,
                m.response->'understood'->'municipality' AS municipality,
                m.created_at
         FROM conversation_messages m
         WHERE m.conversation_id IN (
           SELECT id FROM conversations ORDER BY updated_at DESC, id DESC LIMIT ${CHAT_CONVERSATIONS})
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT ${CHAT_MESSAGES}`,
      );
      const monitors = await c.query<MonitorRow>(
        `SELECT name, intent, updated_at FROM monitors
         WHERE active ORDER BY updated_at DESC LIMIT ${MONITORS}`,
      );
      return { chat: chat.rows, monitors: monitors.rows };
    });
  }

  private intentFor(i: Interest, now: Date): SearchIntent {
    const prior = i.filters.proposals_deadline;
    return SearchIntent.parse({
      q: i.q,
      filters: {
        ...i.filters,
        // Só o que está aberto de verdade: situação "recebendo proposta" e prazo no futuro.
        status: ['open_for_proposals'],
        proposals_deadline: { ...prior, from: now.toISOString() },
      },
      sort: 'relevance',
      page: 1,
      limit: PER_INTEREST,
      facets: [],
    });
  }

  async forYou(userId: string): Promise<RadarForYouResponse> {
    const now = this.clock();
    const { chat, monitors } = await this.load(userId);
    const interests = buildInterests(chat, monitors);
    const toPublic = (i: Interest): RadarInterest => ({ label: i.label, source: i.source });
    const base = { interests: interests.map(toPublic), server_now: now.toISOString() };
    if (interests.length === 0) return { ...base, items: [], empty: 'no_interests' };

    const results = await Promise.all(
      interests.map(async (i) => {
        try {
          const r = await withTimeout(
            this.search.search(this.intentFor(i, now)),
            INTEREST_TIMEOUT_MS,
          );
          return r.items;
        } catch {
          // Um interesse que falha não derruba os outros (sem texto do usuário no log).
          this.log.warn(`interesse do Radar ignorado (${i.source})`);
          return [] as ProcurementSummary[];
        }
      }),
    );

    const byId = new Map<string, { procurement: ProcurementSummary; because: RadarInterest[] }>();
    results.forEach((items, idx) => {
      const interest = interests[idx];
      if (!interest) return;
      for (const p of items) {
        if (p.status !== 'open_for_proposals' || p.deadline.level === 'closed') continue;
        const hit = byId.get(p.id) ?? { procurement: p, because: [] };
        hit.because.push(toPublic(interest));
        byId.set(p.id, hit);
      }
    });

    const items: RadarForYouItem[] = [...byId.values()]
      .sort((a, b) => {
        if (b.because.length !== a.because.length) return b.because.length - a.because.length;
        const ca = a.procurement.proposals_close_at ?? '9999';
        const cb = b.procurement.proposals_close_at ?? '9999';
        return ca === cb ? a.procurement.id.localeCompare(b.procurement.id) : ca < cb ? -1 : 1;
      })
      .slice(0, MAX_ITEMS)
      .map((h) => ({ procurement: h.procurement, because: h.because.slice(0, 3) }));

    return { ...base, items, empty: items.length === 0 ? 'no_matches' : null };
  }
}
