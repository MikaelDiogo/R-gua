import { randomUUID } from 'node:crypto';
import { AiSearchRequest, type AiSearchResult } from '@agora/contracts';
import { createPool, type Db, withUser } from '@agora/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConversationsService, MAX_CONVERSATIONS } from './conversations.service';

/**
 * Contra o Postgres de verdade (RLS incluída). Só roda com TEST_DATABASE_URL apontando para o banco de
 * desenvolvimento (papel agora_app):  TEST_DATABASE_URL=$DATABASE_URL pnpm --filter @agora/api test
 * Cada execução cria dois usuários descartáveis e os apaga no fim (as conversas saem em cascata).
 */
const URL = process.env.TEST_DATABASE_URL;

const result = (): AiSearchResult =>
  ({
    understood: { summary: 'x', keywords: ['x'], filters: [] },
    results: [],
    web_opportunities: [],
    watchlist: [],
    conclusion: 'c',
    candidates_considered: 0,
    total_matches: 0,
    meta: {
      provider: 'p',
      model: 'm',
      tokens_in: null,
      tokens_out: null,
      took_ms: 1,
      web_search: 'skipped',
      degraded: [],
    },
    disclaimer: '',
    server_now: new Date().toISOString(),
  }) as AiSearchResult;

describe.skipIf(!URL)('conversas no Postgres real', () => {
  let db: Db;
  let svc: ConversationsService;
  let a = '';
  let b = '';
  const tag = randomUUID().slice(0, 8);

  const mkUser = async (name: string) => {
    const r = await db.query<{ id: string }>(
      "INSERT INTO users (username, password_hash, name, role) VALUES ($1, 'x', 'Teste', 'user') RETURNING id",
      [name],
    );
    return r.rows[0]?.id as string;
  };
  const ask = (userId: string, prompt: string, conversation_id?: string) =>
    svc.saveExchange(userId, AiSearchRequest.parse({ prompt, conversation_id }), result());

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    db = createPool('app');
    svc = new ConversationsService(db);
    a = await mkUser(`conv-a-${tag}`);
    b = await mkUser(`conv-b-${tag}`);
  });

  afterAll(async () => {
    await db.query('DELETE FROM users WHERE id = ANY($1)', [[a, b]]);
    await db.end();
  });

  it('cria a conversa sozinha, com título e as duas mensagens em ordem', async () => {
    const out = await ask(a, '  Notebooks   para escola,\nacima de 100 mil  ');
    expect(out.meta.degraded).not.toContain('history_not_saved');
    const d = await svc.get(a, out.conversation_id);
    expect(d.conversation.title).toBe('Notebooks para escola, acima de 100 mil');
    expect(d.conversation.message_count).toBe(2);
    expect(d.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(d.messages[0]).toMatchObject({
      prompt: expect.any(String),
      scope: 'all',
      response: null,
    });
    expect(d.messages[0]?.sources).toEqual({ pncp: true, web: true });
    expect(d.messages[1]?.response?.conversation_id).toBe(out.conversation_id);
    expect(d.messages[1]?.prompt).toBeNull();
  });

  it('continuar a conversa acrescenta mensagens e sobe ela na lista', async () => {
    const first = await ask(a, `primeira ${tag}`);
    const second = await ask(a, `segunda ${tag}`);
    await ask(a, 'de novo na primeira', first.conversation_id);
    const list = await svc.list(a, { q: tag });
    expect(list.items.map((i) => i.id)).toEqual([first.conversation_id, second.conversation_id]);
    expect(list.items[0]?.message_count).toBe(4);
  });

  it('isolamento: B não lê, não renomeia, não exclui e não continua conversa de A (404)', async () => {
    const mine = await ask(a, `privada ${tag}`);
    await expect(svc.get(b, mine.conversation_id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(svc.rename(b, mine.conversation_id, { title: 'invadida' })).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(svc.remove(b, mine.conversation_id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(svc.assertOwned(b, mine.conversation_id)).rejects.toMatchObject({
      code: 'not_found',
    });
    const hijack = await ask(b, 'tentando entrar', mine.conversation_id);
    expect(hijack.meta.degraded).toContain('history_not_saved');
    expect((await svc.list(b, { q: tag })).items).toHaveLength(0);
    const still = await svc.get(a, mine.conversation_id);
    expect(still.conversation.title).toContain('privada');
    expect(still.conversation.message_count).toBe(2);
  });

  it('a RLS vale mesmo sem o filtro do serviço: SQL direto como B não enxerga nada de A', async () => {
    const mine = await ask(a, `rls ${tag}`);
    const seen = await withUser(db, b, (c) =>
      c.query('SELECT 1 FROM conversations WHERE id = $1', [mine.conversation_id]),
    );
    expect(seen.rowCount).toBe(0);
    const msgs = await withUser(db, b, (c) =>
      c.query('SELECT 1 FROM conversation_messages WHERE conversation_id = $1', [
        mine.conversation_id,
      ]),
    );
    expect(msgs.rowCount).toBe(0);
    await expect(
      withUser(db, b, (c) =>
        c.query(
          "INSERT INTO conversation_messages (conversation_id, user_id, role, prompt) VALUES ($1, $2, 'user', 'x')",
          [mine.conversation_id, a],
        ),
      ),
    ).rejects.toThrow();
  });

  it('renomear muda o título sem mudar a ordem; excluir apaga em cascata e depois é 404', async () => {
    const c = await ask(a, `renomear ${tag}`);
    const before = (await svc.get(a, c.conversation_id)).conversation.updated_at;
    const renamed = await svc.rename(a, c.conversation_id, { title: `  Novo nome ${tag} ` });
    expect(renamed.title).toBe(`Novo nome ${tag}`);
    expect(renamed.updated_at).toBe(before);
    await expect(svc.rename(a, c.conversation_id, { title: '' })).rejects.toThrow();
    await svc.remove(a, c.conversation_id);
    await expect(svc.get(a, c.conversation_id)).rejects.toMatchObject({ code: 'not_found' });
    const left = await db.query('SELECT 1 FROM conversation_messages WHERE conversation_id = $1', [
      c.conversation_id,
    ]);
    expect(left.rowCount).toBe(0);
    await expect(svc.remove(a, c.conversation_id)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('busca no título ignora acento e caixa; % e _ valem como texto', async () => {
    await ask(a, `Licitação de Medicamentos ${tag}`);
    await ask(a, `100% garantido_${tag}`);
    expect((await svc.list(a, { q: `LICITACAO de medicamentos ${tag}` })).items).toHaveLength(1);
    expect((await svc.list(a, { q: `100% garantido_${tag}` })).items).toHaveLength(1);
    expect((await svc.list(a, { q: `%${tag}%x` })).items).toHaveLength(0);
  });

  it('paginação por cursor: sem repetir nem pular, e acaba com next_cursor null', async () => {
    const c = randomUUID().slice(0, 8);
    for (let i = 0; i < 5; i++) await ask(b, `pag ${c} ${i}`);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const r = await svc.list(b, { q: `pag ${c}`, limit: 2, cursor });
      seen.push(...r.items.map((i) => i.title));
      if (!r.next_cursor) break;
      cursor = r.next_cursor;
    }
    expect(seen).toEqual([4, 3, 2, 1, 0].map((i) => `pag ${c} ${i}`));
    await expect(svc.list(b, { cursor: 'lixo' })).rejects.toMatchObject({
      code: 'validation_failed',
    });
  });

  it(`limite de ${MAX_CONVERSATIONS}: a mais antiga sai na mesma transação`, async () => {
    const u = await mkUser(`conv-lim-${tag}`);
    try {
      await withUser(db, u, (c) =>
        c.query(
          `INSERT INTO conversations (user_id, title, created_at, updated_at)
           SELECT $1, 'antiga ' || g, now() - make_interval(mins => g), now() - make_interval(mins => g)
           FROM generate_series(1, $2) g`,
          [u, MAX_CONVERSATIONS],
        ),
      );
      const out = await ask(u, 'a que passa do limite');
      const n = await withUser(db, u, (c) =>
        c.query<{ n: string }>('SELECT count(*) AS n FROM conversations'),
      );
      expect(Number(n.rows[0]?.n)).toBe(MAX_CONVERSATIONS);
      const gone = await withUser(db, u, (c) =>
        c.query("SELECT 1 FROM conversations WHERE title = 'antiga ' || $1::text", [
          MAX_CONVERSATIONS,
        ]),
      );
      expect(gone.rowCount).toBe(0);
      await expect(svc.get(u, out.conversation_id)).resolves.toBeDefined();
    } finally {
      await db.query('DELETE FROM users WHERE id = $1', [u]);
    }
  });

  it('resposta acima de 2 MB não é guardada, mas a busca devolve com history_not_saved', async () => {
    const big = result();
    big.conclusion = 'x'.repeat(2 * 1024 * 1024 + 10);
    const before = (await svc.list(a, {})).items.length;
    const out = await svc.saveExchange(a, AiSearchRequest.parse({ prompt: `grande ${tag}` }), big);
    expect(out.meta.degraded).toContain('history_not_saved');
    expect((await svc.list(a, { q: `grande ${tag}` })).items).toHaveLength(0);
    expect((await svc.list(a, {})).items.length).toBeGreaterThanOrEqual(Math.min(before, 20));
  });
});
