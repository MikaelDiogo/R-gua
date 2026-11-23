'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { RecentsData } from './conversas/RecentChats';
import { Sidebar } from './Sidebar';

const BARE = ['/login'];

/** Telas de entrada ficam fora da casca (sem menu lateral). */
export function Shell({
  user,
  recents,
  children,
}: {
  user: { username: string; name: string | null; role: 'admin' | 'user' } | null;
  recents: RecentsData | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  if (BARE.includes(pathname)) return <>{children}</>;
  return (
    <div className="shell">
      <Sidebar user={user} recents={recents} />
      <main className="canvas" id="conteudo">
        {children}
      </main>
    </div>
  );
}
