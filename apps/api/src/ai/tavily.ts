export interface WebSource {
  title: string;
  url: string;
  host: string;
  snippet: string;
}

export interface TavilyOptions {
  apiKey: string | undefined;
  timeoutMs?: number;
  /** Teto da extração de conteúdo das páginas (padrão 15 s). */
  extractTimeoutMs?: number;
  fetch?: typeof fetch;
}

/** Portais de compras públicas aceitos na busca e na extração. Qualquer outro endereço é recusado. */
export const PORTAL_DOMAINS = [
  'pncp.gov.br',
  'gov.br',
  'bll.org.br',
  'licitanet.com.br',
  'compraspublicas.com.br',
  'bnc.org.br',
  'portaldecompraspublicas.com.br',
  'licitacoes-e.com.br',
];

/** Só https, sem usuário e senha na URL, e só em portal da lista (ou subdomínio dele). */
export function isAllowedWebUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  return PORTAL_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
}

const sameUrl = (a: string, b: string) => {
  const n = (x: string) => {
    try {
      const u = new URL(x);
      u.hash = '';
      return u.toString().replace(/\/$/, '');
    } catch {
      return x;
    }
  };
  return n(a) === n(b);
};

/**
 * Pesquisa na web (Tavily). Os links e trechos vêm do buscador, nunca de um modelo, então não podem ser inventados.
 * O conteúdo é de terceiros: tratado como dado não confiável (docs/10 §4). Falha nunca derruba a avaliação.
 */
export class TavilySearch {
  private readonly timeoutMs: number;
  private readonly doFetch: typeof fetch;

  constructor(private readonly opts: TavilyOptions) {
    this.timeoutMs = opts.timeoutMs ?? 9_000;
    this.doFetch = opts.fetch ?? fetch;
  }

  get configured(): boolean {
    return Boolean(this.opts.apiKey);
  }

  /** `null` quando a chamada falhou (diferente de lista vazia: nenhuma fonte achada). */
  async search(
    query: string,
    max = 3,
    includeDomains?: string[],
    snippetMax = 320,
  ): Promise<WebSource[] | null> {
    if (!this.opts.apiKey) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.doFetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.opts.apiKey}`,
        },
        body: JSON.stringify({
          query: query.slice(0, 380),
          max_results: max,
          search_depth: 'basic',
          include_answer: false,
          ...(includeDomains?.length ? { include_domains: includeDomains } : {}),
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        results?: Array<{ title?: string; url?: string; content?: string }>;
      };
      const out: WebSource[] = [];
      for (const r of body.results ?? []) {
        let u: URL;
        try {
          u = new URL(r.url ?? '');
        } catch {
          continue;
        }
        if (u.protocol !== 'https:' && u.protocol !== 'http:') continue; // nada de javascript: ou data:
        out.push({
          title: (r.title ?? u.host).slice(0, 160),
          url: u.toString(),
          host: u.host,
          snippet: (r.content ?? '').replace(/\s+/g, ' ').slice(0, snippetMax),
        });
      }
      return out;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Lê o conteúdo das páginas (HTML ou PDF já convertido em texto pelo Tavily). Só URLs de portais permitidos, no
   * máximo 5. Devolve só o que foi pedido: URL que o Tavily acrescentar por conta própria é ignorada. `null` = a
   * chamada falhou (quem chama cai para o trecho do buscador); mapa vazio = nada legível.
   */
  async extract(urls: string[], maxCharsPerUrl = 12_000): Promise<Map<string, string> | null> {
    if (!this.opts.apiKey) return null;
    const wanted = [...new Set(urls.filter(isAllowedWebUrl))].slice(0, 5);
    if (wanted.length === 0) return new Map();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.extractTimeoutMs ?? 15_000);
    try {
      const res = await this.doFetch('https://api.tavily.com/extract', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.opts.apiKey}`,
        },
        body: JSON.stringify({ urls: wanted, extract_depth: 'basic', include_images: false }),
        signal: ctrl.signal,
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        results?: Array<{ url?: string; raw_content?: string }>;
      };
      const out = new Map<string, string>();
      for (const r of body.results ?? []) {
        const key = wanted.find((w) => sameUrl(w, r.url ?? ''));
        if (!key) continue;
        const text = (r.raw_content ?? '')
          .replace(/\r/g, '')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        if (text.length >= 80) out.set(key, text.slice(0, maxCharsPerUrl));
      }
      return out;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
