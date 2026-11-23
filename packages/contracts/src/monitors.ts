import { z } from 'zod';
import { ProcurementSummary, SearchResponse } from './procurements';
import { SearchIntent } from './search';

/** O que o monitor procura: o mesmo vocabulário da busca (palavras e filtros), validado no servidor. */
export const MonitorIntent = z
  .object({
    q: z.string().trim().max(500).optional(),
    filters: SearchIntent.shape.filters,
    sort: z
      .enum(['relevance', 'deadline_asc', 'published_desc', 'value_desc'])
      .default('published_desc'),
  })
  .strict();
export type MonitorIntent = z.infer<typeof MonitorIntent>;

/** Só o canal "app" (alertas dentro do sistema) existe por enquanto: e-mail depende de um serviço de envio. */
export const MonitorChannel = z.enum(['app']);
export const MonitorFrequency = z.enum(['immediate', 'daily']);

export const Monitor = z.object({
  id: z.string().uuid(),
  name: z.string(),
  intent: MonitorIntent,
  frequency: MonitorFrequency,
  channels: z.array(MonitorChannel),
  active: z.boolean(),
  last_run_at: z.string().datetime().nullable(),
  /** Alertas ainda não lidos deste monitor. */
  unread: z.number().int(),
  version: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Monitor = z.infer<typeof Monitor>;

export const MonitorList = z.object({ items: z.array(Monitor), server_now: z.string().datetime() });
export type MonitorList = z.infer<typeof MonitorList>;

export const CreateMonitor = z
  .object({
    name: z.string().trim().min(1).max(120),
    intent: MonitorIntent,
    frequency: MonitorFrequency.default('immediate'),
    channels: z.array(MonitorChannel).min(1).default(['app']),
    active: z.boolean().default(true),
  })
  .strict();
export type CreateMonitor = z.infer<typeof CreateMonitor>;

export const UpdateMonitor = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    intent: MonitorIntent.optional(),
    frequency: MonitorFrequency.optional(),
    channels: z.array(MonitorChannel).min(1).optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type UpdateMonitor = z.infer<typeof UpdateMonitor>;

export const AlertItem = z.object({
  id: z.string().uuid(),
  monitor_id: z.string().uuid(),
  monitor_name: z.string(),
  /** new = edital que passou a casar com o monitor; changed = edital já acompanhado que mudou (prazo, situação ou valor). */
  kind: z.enum(['new', 'changed']),
  /** Para `changed`: o que mudou, em palavras. */
  change: z.string().nullable(),
  created_at: z.string().datetime(),
  read_at: z.string().datetime().nullable(),
  procurement: ProcurementSummary,
});
export type AlertItem = z.infer<typeof AlertItem>;

export const AlertsResponse = z.object({
  items: z.array(AlertItem),
  unread_total: z.number().int(),
  page: z.number().int(),
  page_size: z.number().int(),
  total: z.number().int(),
  server_now: z.string().datetime(),
});
export type AlertsResponse = z.infer<typeof AlertsResponse>;

export const MarkAlertsRead = z
  .object({ ids: z.array(z.string().uuid()).max(200).optional(), all: z.boolean().optional() })
  .strict();

export const MonitorDetail = z.object({
  monitor: Monitor,
  /** Alertas não lidos deste monitor, mais novos primeiro. */
  unread_alerts: z.array(AlertItem),
  /** Editais que casam com o monitor agora (primeira página; paginação por `?page=`). */
  matches: SearchResponse,
  server_now: z.string().datetime(),
});
export type MonitorDetail = z.infer<typeof MonitorDetail>;

export const RunMonitorResponse = z.object({
  new_count: z.number().int(),
  changed_count: z.number().int(),
  monitor: Monitor,
  server_now: z.string().datetime(),
});
export type RunMonitorResponse = z.infer<typeof RunMonitorResponse>;
