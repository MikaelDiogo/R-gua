import { z } from 'zod';
import { AiSearchResponse } from './ai';

/** Histórico do chat de IA, por usuário (como as conversas do Claude). A identidade vem da sessão, nunca do corpo. */
export const ConversationSummary = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    message_count: z.number().int().min(0),
  })
  .strict();
export type ConversationSummary = z.infer<typeof ConversationSummary>;

/** Filtros da lista: `q` busca no título (sem acento); `cursor` é opaco (updated_at + id). */
export const ConversationsQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    q: z.string().trim().max(120).optional(),
    cursor: z.string().max(200).optional(),
  })
  .strict();
export type ConversationsQuery = z.infer<typeof ConversationsQuery>;

export const ConversationsResponse = z
  .object({
    items: z.array(ConversationSummary),
    next_cursor: z.string().nullable(),
  })
  .strict();
export type ConversationsResponse = z.infer<typeof ConversationsResponse>;

export const ConversationMessage = z
  .object({
    id: z.string().uuid(),
    role: z.enum(['user', 'assistant']),
    /** Só nas mensagens do usuário. */
    prompt: z.string().nullable(),
    sources: z.object({ pncp: z.boolean(), web: z.boolean() }).strict().nullable(),
    scope: z.enum(['open', 'all']).nullable(),
    /** Só nas mensagens do assistente: a resposta completa, como foi devolvida na hora. */
    response: AiSearchResponse.nullable(),
    created_at: z.string().datetime(),
  })
  .strict();
export type ConversationMessage = z.infer<typeof ConversationMessage>;

export const ConversationDetail = z
  .object({
    conversation: ConversationSummary,
    messages: z.array(ConversationMessage),
  })
  .strict();
export type ConversationDetail = z.infer<typeof ConversationDetail>;

export const RenameConversationRequest = z
  .object({ title: z.string().trim().min(1).max(120) })
  .strict();
export type RenameConversationRequest = z.infer<typeof RenameConversationRequest>;
