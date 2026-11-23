'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ALERTS_EVENT } from '@/lib/monitors';
import { RecentChats, type RecentsData } from './conversas/RecentChats';
import { Icon, type IconName, Logo } from './Icon';
import { ExtraIcon, type ExtraIconName } from './NavIcons';

type Item = { label: string; href: string; icon: IconName | ExtraIconName };
const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: 'Trabalho',
    items: [
      { label: 'Chat de IA', href: '/chat', icon: 'chat' },
      { label: 'Radar', href: '/radar', icon: 'bars' },
      { label: 'Buscador', href: '/busca', icon: 'search' },
      { label: 'Funil', href: '/pipeline', icon: 'board' },
    ],
  },
  {
    label: 'Documentos',
    items: [
      { label: 'Propostas', href: '/propostas', icon: 'doc' },
      { label: 'Precificador', href: '/precificador', icon: 'price' },
      { label: 'Recursos e impugnações', href: '/recursos', icon: 'gavel' },
    ],
  },
  {
    label: 'Acompanhar',
    items: [
      { label: 'Monitores', href: '/monitores', icon: 'monitor' },
      { label: 'Alertas', href: '/alertas', icon: 'bell' },
    ],
  },
];

const EXTRA: ExtraIconName[] = ['monitor', 'price', 'gavel'];
const isExtra = (n: string): n is ExtraIconName => (EXTRA as string[]).includes(n);

export function Sidebar({
  user,
  recents,
}: {
  user: { username: string; name: string | null; role: 'admin' | 'user' } | null;
  /** Últimas conversas do chat lidas pelo servidor (null = a API não respondeu: a seção não aparece). */
  recents: RecentsData | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fecha a gaveta ao navegar
  useEffect(() => setOpen(false), [pathname]);

  // Alertas não lidos ao lado do item "Alertas": só quando > 0. Relê ao navegar e quando algo marca como lido.
  // biome-ignore lint/correctness/useExhaustiveDependencies: relê a cada navegação
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const read = async () => {
      const r = await api<{ unread_total: number }>('/alerts?unread=1&limit=1');
      if (alive && r.ok) setUnread(r.data.unread_total);
    };
    void read();
    window.addEventListener(ALERTS_EVENT, read);
    return () => {
      alive = false;
      window.removeEventListener(ALERTS_EVENT, read);
    };
  }, [pathname, user]);

  const isCurrent = (href: string) =>
    pathname === href ||
    pathname.startsWith(`${href}/`) ||
    (href === '/busca' && pathname.startsWith('/editais'));

  return (
    <>
      <header className="topbar">
        <button
          type="button"
          className="menuBtn"
          aria-expanded={open}
          aria-controls="main-nav"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={open ? 'x' : 'menu'} size={20} />
        </button>
        <Link href="/chat" aria-label="Régua, início" className="topbarBrand">
          <Logo />
        </Link>
      </header>
      {open ? (
        <button
          type="button"
          className="scrim"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <nav className="rg-side" id="main-nav" data-open={open} aria-label="Navegação principal">
        <Link href="/chat" className="brandLink" aria-label="Régua, início">
          <Logo />
        </Link>
        <Link href="/chat" className="rg-btn rg-newchat">
          <Icon name="plus" />
          Nova conversa
        </Link>
        {user ? (
          <Suspense fallback={null}>
            <RecentChats initial={recents} />
          </Suspense>
        ) : null}

        {GROUPS.map((g) => (
          <div key={g.label} className="navGroup">
            <div className="rg-nav-group">{g.label}</div>
            {g.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rg-nav-item"
                aria-current={isCurrent(item.href) ? 'page' : undefined}
              >
                {isExtra(item.icon) ? <ExtraIcon name={item.icon} /> : <Icon name={item.icon} />}
                <span>{item.label}</span>
                {item.href === '/alertas' && unread > 0 ? (
                  <span className="navCount">
                    {unread}
                    <span className="sr-only"> não lidos</span>
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        ))}

        <div className="sideFoot">
          <Link
            href="/configuracoes/ia"
            className="rg-nav-item"
            aria-current={
              pathname.startsWith('/configuracoes') && !pathname.startsWith('/configuracoes/senha')
                ? 'page'
                : undefined
            }
          >
            <Icon name="gear" />
            <span>Configurações</span>
          </Link>
          {user?.role === 'admin' ? (
            <Link
              href="/admin"
              className="rg-nav-item"
              aria-current={pathname.startsWith('/admin') ? 'page' : undefined}
            >
              <Icon name="lock" />
              <span>Administração</span>
            </Link>
          ) : null}
          {user ? (
            <div className="userRow">
              <span className="userName" title={user.name ? user.username : undefined}>
                {user.name ?? user.username}
              </span>
              <span className="userActions">
                <Link
                  href="/configuracoes/senha"
                  className="linkBtn"
                  aria-current={pathname.startsWith('/configuracoes/senha') ? 'page' : undefined}
                >
                  Alterar senha
                </Link>
                <button
                  type="button"
                  className="linkBtn"
                  onClick={async () => {
                    await api('/auth/logout', { method: 'POST' });
                    window.location.assign('/login');
                  }}
                >
                  Sair
                </button>
              </span>
            </div>
          ) : null}
        </div>
      </nav>
    </>
  );
}
