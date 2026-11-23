import {
  AiSearchRequest,
  AiSearchResponse,
  type AiSearchResult,
  ConversationsQuery,
  RenameConversationRequest,
} from '@agora/contracts';
import type { Db } from '@agora/db';
import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '../platform/problem.filter';
import {
  ConversationsService,
  decodeCursor,
  encodeCursor,
  titleFrom,
} from './conversations.service';

const USER = '11111111-1111-4111-8111-111111111111';
const CONV = '22222222-2222-4222-8222-222222222222';

const result = (): AiSearchResult =>
  ({
    understood: { summary: 'x', keywords: ['x'], filters: [] },
    results: [],
    web_opportunities: [],
    watchlist: [],
    conclusion: '',
    candidates_considered: 0,
    total_matches: 0,
    meta: {
      provider: 'p',
      model: 'm',
      tokens_in: null,
      tokens_out: null,
      took_ms: 1,
      web_search: 'skipped',
      degraded: ['nl_understanding'],
    },
    disclaimer: '',
    server_now: new Date().toISOString(),
  }) as AiSearchResult;

/** Banco que explode se alguém o usar: prova que o id malformado nem chega a consultar. */
const deadDb = () => {
  const connect = vi.fn(async () => {
    throw new Error('sem banco');
  });
  return { db: { connect } as unknown as Db, connect };
};

describe('contratos do histórico', () => {
  it('rejeitam campos extras (strict) e valores fora do limite', () => {
    expect(() => ConversationsQuery.parse({ user_id: USER })).toThrow();
    expect(() => ConversationsQuery.parse({ limit: 51 })).toThrow();
    expect(() => ConversationsQuery.parse({ limit: 0 })).toThrow();
    expect(ConversationsQuery.parse({}).limit).toBe(20);
    expect(ConversationsQuery.parse({ limit: '5' }).limit).toBe(5);
    expect(() => RenameConversationRequest.parse({ title: 'ok', user_id: USER })).toThrow();
    expect(() => RenameConversationRequest.parse({ title: '   ' })).toThrow();
    expect(() => RenameConversationRequest.parse({ title: 'a'.repeat(121) })).toThrow();
    expect(RenameConversationRequest.parse({ title: '  Meu título  ' }).title).toBe('Meu título');
  });

  it('AiSearchRequest aceita conversation_id uuid e recusa outro formato; a resposta exige o id', () => {
    expect(
      AiSearchRequest.parse({ prompt: 'notebooks', conversation_id: CONV }).conversation_id,
    ).toBe(CONV);
    expect(() => AiSearchRequest.parse({ prompt: 'notebooks', conversation_id: 'abc' })).toThrow();
    expect(() => AiSearchRequest.parse({ prompt: 'notebooks', user_id: USER })).toThrow();
    expect(AiSearchResponse.safeParse(result()).success).toBe(false);
    expect(AiSearchResponse.safeParse({ ...result(), conversation_id: CONV }).success).toBe(true);
  });
});

describe('título e cursor', () => {
  it('título: uma linha, até 60 caracteres, com fallback', () => {
    expect(titleFrom('notebooks\n  para   escola')).toBe('notebooks para escola');
    expect(titleFrom('a'.repeat(100))).toHaveLength(60);
    expect(titleFrom('   \n  ')).toBe('Nova conversa');
  });

  it('cursor: ida e volta; lixo vira 422 (validation_failed)', () => {
    const c = encodeCursor('2026-11-23T10:00:00.123456Z', CONV);
    expect(decodeCursor(c)).toEqual({ t: '2026-11-23T10:00:00.123456Z', i: CONV });
    for (const bad of ['', 'xxxx', Buffer.from('{"t":"x","i":"y"}').toString('base64url')]) {
      expect(() => decodeCursor(bad)).toThrow(DomainError);
    }
  });
});

describe('ConversationsService sem banco', () => {
  it('id malformado é 404 e nem consulta o banco', async () => {
    const { db, connect } = deadDb();
    const svc = new ConversationsService(db);
    await expect(svc.get(USER, 'nao-e-uuid')).rejects.toMatchObject({ code: 'not_found' });
    await expect(svc.rename(USER, '1; DROP TABLE x', { title: 'a' })).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(svc.remove(USER, '../../etc')).rejects.toMatchObject({ code: 'not_found' });
    await expect(svc.assertOwned(USER, '')).rejects.toMatchObject({ code: 'not_found' });
    expect(connect).not.toHaveBeenCalled();
  });

  it('falha ao gravar NÃO derruba a busca: devolve a resposta com history_not_saved', async () => {
    const { db } = deadDb();
    const svc = new ConversationsService(db);
    const req = AiSearchRequest.parse({ prompt: 'texto sigiloso do usuário' });
    const out = await svc.saveExchange(USER, req, result());
    expect(out.meta.degraded).toEqual(['nl_understanding', 'history_not_saved']);
    expect(out.conversation_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(AiSearchResponse.safeParse(out).success).toBe(true);
  });

  it('numa conversa existente, a falha devolve o mesmo conversation_id', async () => {
    const { db } = deadDb();
    const svc = new ConversationsService(db);
    const req = AiSearchRequest.parse({ prompt: 'mais uma', conversation_id: CONV });
    const out = await svc.saveExchange(USER, req, result());
    expect(out.conversation_id).toBe(CONV);
    expect(out.meta.degraded).toContain('history_not_saved');
  });
});
