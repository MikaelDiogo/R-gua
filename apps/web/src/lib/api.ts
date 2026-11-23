import type { ProblemDetails } from '@agora/contracts';

/** Resultado de uma chamada à API: nunca lança. `unreachable` = o servidor não respondeu (diferente de "sem resultados"). */
export type ApiResult<T> =
  | { ok: true; data: T; at: string }
  | {
      ok: false;
      unreachable: boolean;
      problem: Partial<ProblemDetails> | null;
      status: number;
      at: string;
    };

const SERVER_BASE = process.env.API_URL ?? 'http://127.0.0.1:3101';

/** No servidor (Next) vai direto à API; no navegador passa pelo rewrite /api/*. */
const base = () => (typeof window === 'undefined' ? `${SERVER_BASE}/v1` : '/api');

/** Só caminho relativo e interno: evita redirecionar para outro site. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export async function api<T>(
  path: string,
  init: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
    /** Permite cancelar (botão Cancelar) ou limitar o tempo de chamadas longas, como a Busca com IA. */
    signal?: AbortSignal;
  } = {},
): Promise<ApiResult<T>> {
  const at = new Date().toISOString();
  // Servidor do Next: encaminha o cookie da pessoa à API (o navegador já o envia nas chamadas via /api).
  let cookie: string | undefined;
  let here = '/';
  if (typeof window === 'undefined') {
    const { cookies, headers } = await import('next/headers');
    cookie = (await cookies()).toString() || undefined;
    here = (await headers()).get('x-pathname') ?? '/';
  } else {
    here = window.location.pathname + window.location.search;
  }
  try {
    const res = await fetch(`${base()}${path}`, {
      method: init.method ?? 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      signal: init.signal,
      headers: {
        accept: 'application/json',
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* corpo não JSON (ex.: página de erro do proxy) */
    }
    if (res.ok) return { ok: true, data: json as T, at };
    // Sessão ausente ou vencida: leva ao login e volta para onde a pessoa estava (a tela de login em si não redireciona).
    if (res.status === 401 && !path.startsWith('/auth/')) {
      const to = `/login?next=${encodeURIComponent(here)}`;
      if (typeof window === 'undefined') {
        const { redirect } = await import('next/navigation');
        redirect(to);
      } else {
        window.location.assign(to);
      }
    }
    // Proxy sem API por trás responde 5xx sem problem+json: tratar como indisponível.
    const problem =
      json && typeof json === 'object' && 'code' in json ? (json as Partial<ProblemDetails>) : null;
    return {
      ok: false,
      unreachable: !problem && res.status >= 500,
      problem,
      status: res.status,
      at,
    };
  } catch {
    return { ok: false, unreachable: true, problem: null, status: 0, at };
  }
}

/** Mensagem para o usuário a partir de um resultado com falha. */
export function problemText(r: Extract<ApiResult<unknown>, { ok: false }>): {
  title: string;
  detail: string;
} {
  if (r.unreachable) {
    return {
      title: 'Não foi possível falar com o servidor.',
      detail: 'Isso não significa que não existam editais. Tente de novo em instantes.',
    };
  }
  return {
    title: r.problem?.title ?? 'O servidor recusou o pedido.',
    detail: r.problem?.detail ?? '',
  };
}

export const newKey = () => crypto.randomUUID();
