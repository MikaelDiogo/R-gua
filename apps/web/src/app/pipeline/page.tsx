import '@/styles/work.css';
import type { PipelineResponse } from '@agora/contracts';
import { KanbanBoard } from '@/components/KanbanBoard';
import { api, problemText } from '@/lib/api';

export const metadata = { title: 'Pipeline · Régua' };

export default async function PipelinePage() {
  const r = await api<PipelineResponse>('/pipeline');
  return <KanbanBoard initial={r.ok ? r.data : null} error={r.ok ? null : problemText(r)} />;
}
