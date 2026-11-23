export interface WebSource {
  title: string;
  url: string;
  host: string;
  snippet: string;
}

export interface TavilyOptions {
  apiKey: string | undefined;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

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
}
