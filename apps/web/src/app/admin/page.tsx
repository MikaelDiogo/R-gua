import '@/styles/work.css';
import type { AdminUsersResponse, MeResponse } from '@agora/contracts';
import { notFound } from 'next/navigation';
import { AdminUsers } from '@/components/admin/AdminUsers';
import { PageHeader, StateBlock } from '@/components/ui';
import { api, problemText } from '@/lib/api';

export const metadata = { title: 'Administração · Régua' };

/** Só administradores veem esta tela. Quem decide é a API; aqui o papel só evita mostrar uma tela que daria 403. */
export default async function AdminPage() {
  const me = await api<MeResponse>('/me');
  if (me.ok && me.data.user.role !== 'admin') notFound();

  const users = await api<AdminUsersResponse>('/admin/users');
  if (!users.ok) {
    if (users.status === 403) {
      return (
        <>
          <PageHeader title="Administração" />
          <StateBlock kind="error" title="Sem permissão">
            Só administradores podem criar e gerenciar contas.
          </StateBlock>
        </>
      );
    }
    const msg = problemText(users);
    return (
      <>
        <PageHeader title="Administração" />
        <StateBlock kind="error" title={msg.title}>
          {msg.detail}
        </StateBlock>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Administração"
        lead="Crie as contas das pessoas da equipe. Não há cadastro público: só quem recebe uma conta entra."
      />
      <AdminUsers
        initial={users.data.items}
        currentUserId={me.ok ? me.data.user.id : null}
        loadedAt={users.at}
      />
    </>
  );
}
