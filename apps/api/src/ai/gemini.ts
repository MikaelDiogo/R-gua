import type { ZodType } from 'zod';
import { DomainError } from '../platform/problem.filter';

export interface GeminiOptions {
  apiKey: string | undefined;
  /** Vem da configuração (env/banco), nunca de constante no código (docs/16 §1). */
  model: string | undefined;
  fallbackModel?: string | undefined;
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** Esquema de saída no subconjunto OpenAPI do Gemini (tipos em maiúsculas). */
export type GeminiSchema = Record<string, unknown>;

export interface LlmResult<T> {
  value: T;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
}

interface GenerateArgs<T> {
  system: string;
  user: string;
  responseSchema: GeminiSchema;
  parse: ZodType<T>;
  maxOutputTokens?: number;
  /** Textos longos (edital) pedem mais tempo que o padrão. */
  timeoutMs?: number;
}

/**
 * Adaptador do Gemini atrás da porta `LlmGateway` (docs/16 §3). Saída estruturada validada por zod no servidor;
 * erros do provedor viram problemas tipados (`ai_provider_*`). Retry com backoff em 429/5xx e fallback de modelo.
 */
export class GeminiGateway {
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly doFetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: GeminiOptions) {
    this.base = opts.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    this.timeoutMs = opts.timeoutMs ?? 40_000;
    this.retries = opts.retries ?? 1;
    this.doFetch = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  get configured(): boolean {
    return Boolean(this.opts.apiKey && this.opts.model);
  }

  get modelName(): string {
    return this.opts.model ?? '(não configurado)';
  }

  async generateObject<T>(args: GenerateArgs<T>): Promise<LlmResult<T>> {
    if (!this.opts.apiKey || !this.opts.model) {
      throw new DomainError(
        'ai_provider_auth_failed',
        'IA não configurada: defina GEMINI_API_KEY e GEMINI_MODEL no servidor.',
      );
    }
    const models = [this.opts.model, this.opts.fallbackModel].filter((m): m is string =>
      Boolean(m),
    );
    let last: DomainError | null = null;
    for (const model of models) {
      try {
        return await this.callWithRetry(model, args);
      } catch (e) {
        if (!(e instanceof DomainError)) throw e;
        last = e;
        // Troca de modelo quando o problema é do modelo (fora do ar ou cota própria dele: a cota é por modelo).
        // Chave inválida não melhora trocando de modelo.
        if (e.code !== 'ai_provider_unavailable' && e.code !== 'ai_provider_quota') throw e;
      }
    }
    throw last ?? new DomainError('ai_provider_unavailable', 'IA indisponível');
  }

  private async callWithRetry<T>(model: string, args: GenerateArgs<T>): Promise<LlmResult<T>> {
    let lastErr: DomainError | null = null;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const raw = await this.once(model, args);
        const parsed = args.parse.safeParse(raw.json);
        if (!parsed.success) {
          // Um reparo basta (docs/09 §1): se falhar de novo, falha clara em vez de texto livre.
          lastErr = new DomainError(
            'ai_provider_unavailable',
            'A IA devolveu uma resposta fora do formato esperado.',
          );
          continue;
        }
        return { value: parsed.data, model, tokensIn: raw.tokensIn, tokensOut: raw.tokensOut };
      } catch (e) {
        if (!(e instanceof DomainError)) throw e;
        if (e.code !== 'ai_provider_unavailable') throw e;
        lastErr = e;
      }
      if (attempt < this.retries) await this.sleep(1000 * 2 ** attempt);
    }
    throw lastErr ?? new DomainError('ai_provider_unavailable', 'IA indisponível');
  }

  private async once(model: string, args: GenerateArgs<unknown>) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? this.timeoutMs);
    let res: Response;
    try {
      res = await this.doFetch(`${this.base}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.opts.apiKey as string,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: args.system }] },
          contents: [{ role: 'user', parts: [{ text: args.user }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: args.responseSchema,
            temperature: 0.2,
            maxOutputTokens: args.maxOutputTokens ?? 4096,
          },
        }),
        signal: ctrl.signal,
      });
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      throw new DomainError(
        'ai_provider_unavailable',
        aborted ? 'A IA demorou demais para responder.' : 'Não foi possível falar com a IA.',
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      throw new DomainError('ai_provider_auth_failed', 'A chave da IA foi recusada pelo provedor.');
    }
    if (res.status === 429) {
      throw new DomainError(
        'ai_provider_quota',
        'O limite de uso da IA foi atingido. Tente novamente em instantes.',
      );
    }
    if (!res.ok) {
      // 404 de modelo aposentado e 5xx caem aqui; o corpo do provedor não é repassado ao cliente.
      throw new DomainError(
        'ai_provider_unavailable',
        `A IA está indisponível no momento (${res.status}).`,
      );
    }

    const body = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text =
      body.candidates?.[0]?.content?.parts
        ?.filter((p) => !p.thought)
        .map((p) => p.text ?? '')
        .join('') ?? '';
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return {
      json,
      tokensIn: body.usageMetadata?.promptTokenCount ?? null,
      tokensOut: body.usageMetadata?.candidatesTokenCount ?? null,
    };
  }
}
