import { type NextRequest, NextResponse } from 'next/server';

const PUBLIC = ['/login', '/icon.svg', '/api/auth/'];

/**
 * Só checa a PRESENÇA do cookie de sessão para levar quem não entrou ao login. Quem valida de verdade é a API
 * (docs/04): um cookie falso passa aqui e recebe 401 lá.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const headers = new Headers(req.headers);
  headers.set('x-pathname', `${pathname}${search}`);
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next({ request: { headers } });
  }
  if (!req.cookies.has('regua_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    return NextResponse.redirect(url);
  }
  // A tela inicial do produto é o chat: redireciona de verdade (sem piscar a página vazia da raiz).
  if (pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = '/chat';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
