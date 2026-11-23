/** Filas do worker (`02` §7). Cada job é idempotente e carrega `request_id`. */
export const QUEUES = [
  'ingest',
  'search-index',
  'embeddings',
  'documents',
  'ai-runs',
  'alerts',
  'exports',
  'maintenance',
] as const;
export type QueueName = (typeof QUEUES)[number];
