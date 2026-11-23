import type { MeResponse } from '@agora/contracts';
import { AllConversations } from '@/components/conversas/AllConversations';
import { api } from '@/lib/api';
import { listConversations } from '@/lib/conversations';

export const metadata = { title: 'Todas as conversas · Régua' };

export default async function TodasAsConversas() {
  // O relógio do servidor decide "Hoje" e "Ontem"; a primeira página já vem pronta (sem tela vazia piscando).
  const [me, first] = await Promise.all([api<MeResponse>('/me'), listConversations({ limit: 20 })]);
  return (
    <AllConversations
      initialItems={first.ok ? first.data.items : []}
      initialCursor={first.ok ? first.data.next_cursor : null}
      initialFailed={!first.ok}
      serverNow={me.ok ? me.data.server_now : new Date().toISOString()}
    />
  );
}
