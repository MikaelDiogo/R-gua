import type { ConversationsResponse, MeResponse } from '@agora/contracts';
import type { Metadata } from 'next';
import { Instrument_Sans, Newsreader } from 'next/font/google';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';
import '../styles/tokens.css';
import '../styles/regua.css';
import '../styles/legacy.css';
import './globals.css';

// Auto-hospedadas pelo Next no build (sem requisição ao Google no navegador do usuário).
const newsreader = Newsreader({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-newsreader',
});
const instrument = Instrument_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-instrument',
});

export const metadata: Metadata = {
  title: 'Régua',
  description: 'Licitações públicas lidas, disputadas e com prazo à vista.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Quem está logado (a API valida a sessão). Nas telas de entrada não há o que ler.
  const path = (await headers()).get('x-pathname') ?? '/';
  const bare = path.startsWith('/login');
  const me = bare ? null : await api<MeResponse>('/me');
  const user = me?.ok
    ? { username: me.data.user.username, name: me.data.user.name, role: me.data.user.role }
    : null;
  // Recentes da barra lateral: se a API falhar, a seção some e o resto da casca segue de pé.
  const convos = user ? await api<ConversationsResponse>('/conversations?limit=4') : null;
  const recents = convos?.ok
    ? { items: convos.data.items.slice(0, 4), hasMore: convos.data.next_cursor !== null }
    : null;
  return (
    <html lang="pt-BR" className={`${newsreader.variable} ${instrument.variable}`}>
      <body>
        <a className="skip" href="#conteudo">
          Pular para o conteúdo
        </a>
        <Shell user={user} recents={recents}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
