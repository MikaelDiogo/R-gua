import type { MeResponse } from '@agora/contracts';
import Link from 'next/link';
import { Chat } from '@/components/ai/Chat';
import { api, problemText } from '@/lib/api';
import { getConversation } from '@/lib/conversations';

export const metadata = { title: 'Chat · Régua' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Saudação pelo horário de Brasília do RELÓGIO DO SERVIDOR (`server_now`), nunca o do navegador. */
function greetingFor(me: MeResponse | null): string {
  if (!me) return 'Olá. O que vamos disputar?';
  const first = (me.user.name ?? me.user.username).trim().split(/\s+/)[0] ?? me.user.username;
  const hour = Number(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      hour12: false,
    }).format(new Date(me.server_now)),
  );
  const salute = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  return `${salute}, ${first}. O que vamos disputar?`;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; c?: string | string[] }>;
}) {
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 600);
  const c = one(sp.c);
  const me = await api<MeResponse>('/me');
  const greeting = greetingFor(me.ok ? me.data : null);

  // Conversa nova: `key` próprio, para que sair de uma conversa salva para "Nova conversa" comece do zero.
  if (!c) {
    return (
      <Chat
        key="nova"
        greeting={greeting}
        initialPrompt={q}
        conversationId={null}
        title={null}
        initialMessages={[]}
      />
    );
  }

  const found = UUID.test(c) ? await getConversation(c) : null;
  if (!found || (!found.ok && found.status === 404)) {
    return (
      <div className="rg-stage-col">
        <div className="rg-empty">
          <div className="rg-empty-head">Conversa</div>
          <div className="rg-empty-body">
            <p className="rg-empty-title">Conversa não encontrada.</p>
            <p>Ela pode ter sido excluída, ou o endereço está incorreto.</p>
            <Link className="rg-btn rg-btn-primary" href="/chat">
              Nova conversa
            </Link>
          </div>
        </div>
      </div>
    );
  }
  if (!found.ok) {
    const msg = problemText(found);
    return (
      <div className="rg-stage-col">
        <div className="rg-banner rg-banner-error" role="alert">
          <div className="rg-banner-body">
            <p className="rg-banner-title">Não consegui abrir esta conversa.</p>
            <p>{msg.detail || msg.title} Ela continua salva. Tente de novo em instantes.</p>
          </div>
          <Link className="rg-btn" href={`/chat?c=${c}`}>
            Tentar de novo
          </Link>
          <Link className="rg-btn rg-btn-quiet" href="/chat/conversas">
            Ver todas
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Chat
      key={c}
      greeting={greeting}
      initialPrompt=""
      conversationId={c}
      title={found.data.conversation.title}
      initialMessages={found.data.messages}
    />
  );
}
