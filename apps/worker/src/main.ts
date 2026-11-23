import { QUEUES } from './queues';

// Esqueleto da Etapa 0: os processadores BullMQ entram com a Fase 0 (conector PNCP) e a Fase 1.
console.log(`agora-worker pronto. Filas previstas: ${QUEUES.join(', ')}`);
