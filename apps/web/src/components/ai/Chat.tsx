'use client';

import type { AiSearchRequest, AiSearchResponse, ConversationMessage } from '@agora/contracts';
import { useEffect, useRef, useState } from 'react';
import { AI_TIMEOUT_FAILURE, AI_TIMEOUT_MS, type AiFailure, aiFailure } from '@/lib/ai-errors';
import { api } from '@/lib/api';
import { notifyConversations } from '@/lib/conversations';
import { fmtDateTime } from '@/lib/format';
import { ChatAnswer } from './ChatAnswer';
import s from './chat.module.css';

const MAX_LEN = 600;
const MIN_LEN = 3;

const SUGGESTIONS = [
  'Pregões abertos de TI no Ceará até R$ 200 mil',
  'Notebooks para escola, acima de 100 mil, que encerrem em duas semanas',
  'Medicamentos para posto de saúde no Piauí com propostas abertas',
  'Assessoria jurídica com adequação à LGPD',
];

const MODES_KEY = 'regua:chat:modos:v1';
const LAST_KEY = 'regua:chat:ultimo:v1';

type Scope = AiSearchRequest['scope'];
type Modes = AiSearchRequest['sources'];

interface Saved {
  prompt: string;
  at: string;
  data: AiSearchResponse;
}

type Turn = {
  id: number;
  prompt: string;
  modes: Modes;
  startedAt: number;
} & (
  | { status: 'loading' }
  | { status: 'cancelled' }
  | { status: 'unanswered' }
  | { status: 'done'; data: AiSearchResponse }
  | { status: 'error'; failure: AiFailure }
);

/** Mensagens salvas no servidor → turnos na tela: cada pergunta do usuário com a resposta que veio logo depois. */
function turnsFromMessages(messages: ConversationMessage[]): Turn[] {
  const out: Turn[] = [];
  let n = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || m.role !== 'user') continue;
    const next = messages[i + 1];
    const base = {
      id: ++n,
      prompt: m.prompt ?? '',
      modes: m.sources ?? { pncp: true, web: true },
      startedAt: new Date(m.created_at).getTime(),
    };
    if (next?.role === 'assistant' && next.response) {
      out.push({ ...base, status: 'done', data: next.response });
      i++;
    } else {
      out.push({ ...base, status: 'unanswered' });
    }
  }
  return out;
}

function readModes(): Modes {
  try {
    const raw = window.localStorage.getItem(MODES_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (v && typeof v === 'object' && 'pncp' in v && 'web' in v)
      return { pncp: v.pncp === true, web: v.web === true };
  } catch {
    /* armazenamento bloqueado: vale o padrão */
  }
  return { pncp: true, web: true };
}

function readSaved(): Saved | null {
  try {
    const raw = window.localStorage.getItem(LAST_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (v && typeof v === 'object' && 'prompt' in v && 'at' in v && 'data' in v) return v as Saved;
  } catch {
    /* sem último resultado salvo */
  }
  return null;
}

const Clip = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" />
  </svg>
);
const Up = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);
const Stop = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="7" y="7" width="10" height="10" rx="2" />
  </svg>
);

/**
 * Etapa em destaque pelo TEMPO decorrido. O servidor responde só no fim, então não há como saber a etapa real:
 * a tela diz isso e não mostra porcentagem. A busca leva de 30 a 100 s.
 */
function currentStep(seconds: number, count: number): number {
  const at = [0, 4, 12, 40];
  let step = 0;
  for (let i = 0; i < count; i++) if (seconds >= (at[i] ?? 40)) step = i;
  return step;
}

function Working({ modes, startedAt }: { modes: Modes; startedAt: number }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [startedAt]);
  const steps = [
    'Entendendo o pedido',
    ...(modes.pncp ? ['Buscando no PNCP'] : []),
    ...(modes.web ? ['Buscando na web'] : []),
    'Avaliando',
  ];
  const now = currentStep(seconds, steps.length);
  return (
    <div className={`rg-msg-ai ${s.working}`} aria-busy="true">
      <div className={s.workingHead}>
        <span>Pesquisando</span>
      </div>
      <p className={s.sr} role="status" aria-live="polite">
        Pesquisando com IA. Isso leva de 30 a 100 segundos.
      </p>
      <ol className="rg-steps" aria-label="Etapas da pesquisa">
        {steps.map((label, i) => (
          <li
            key={label}
            data-done={i < now ? '' : undefined}
            data-now={i === now ? '' : undefined}
          >
            {label}
          </li>
        ))}
      </ol>
      <p className={s.note} aria-hidden="true">
        Costuma levar de 30 a 100 segundos ({seconds} s). A etapa em destaque é uma estimativa pelo
        tempo, porque o servidor responde só no fim.
      </p>
    </div>
  );
}

/**
 * Chat de IA (tela inicial). A pessoa descreve o que procura; o servidor entende o pedido, busca no PNCP e/ou na
 * web conforme os chips e a IA avalia (POST /v1/ai/search). Aqui só se envia o texto e se desenha a resposta.
 */
export function Chat({
  greeting,
  initialPrompt,
  conversationId,
  title,
  initialMessages,
}: {
  greeting: string;
  initialPrompt: string;
  /** Conversa salva que está aberta (`/chat?c=...`); null = conversa nova. */
  conversationId: string | null;
  title: string | null;
  initialMessages: ConversationMessage[];
}) {
  const [text, setText] = useState('');
  const [modes, setModes] = useState<Modes>({ pncp: true, web: true });
  const [scope, setScope] = useState<Scope>('all');
  const [turns, setTurns] = useState<Turn[]>(() => turnsFromMessages(initialMessages));
  // Conversa a que as próximas perguntas pertencem: a aberta, ou a que nasce na primeira resposta.
  const convoRef = useRef<string | null>(conversationId);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelRef = useRef(false);
  const idRef = useRef(turns.length);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const autoRan = useRef(false);

  // Modos e último resultado só existem no navegador: lidos depois da montagem (sem divergir do servidor).
  useEffect(() => {
    setModes(readModes());
    setSaved(readSaved());
  }, []);
  useEffect(() => () => abortRef.current?.abort(), []);

  function toggle(key: keyof Modes) {
    setModes((m) => {
      const next = { ...m, [key]: !m[key] };
      try {
        window.localStorage.setItem(MODES_KEY, JSON.stringify(next));
      } catch {
        /* sem armazenamento: o modo volta ao padrão ao recarregar */
      }
      return next;
    });
  }

  const loading = turns.some((t) => t.status === 'loading');
  const noMode = !modes.pncp && !modes.web;
  const trimmed = text.trim();
  const canSend = !loading && !noMode && trimmed.length >= MIN_LEN;

  function patch(id: number, next: Partial<Turn> & { status: Turn['status'] }) {
    setTurns((all) => all.map((t) => (t.id === id ? ({ ...t, ...next } as Turn) : t)));
  }

  async function run(raw: string) {
    const prompt = raw.trim();
    if (loading) return;
    if (noMode) {
      setHint('Ligue PNCP, Web ou os dois para pesquisar.');
      return;
    }
    if (prompt.length < MIN_LEN) {
      setHint(`Escreva pelo menos ${MIN_LEN} caracteres sobre o que você procura.`);
      areaRef.current?.focus();
      return;
    }
    setHint(null);
    setText('');
    const id = ++idRef.current;
    const used = { ...modes };
    const startedAt = Date.now();
    setTurns((all) => [...all, { id, prompt, modes: used, startedAt, status: 'loading' }]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    cancelRef.current = false;
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, AI_TIMEOUT_MS);

    const body: AiSearchRequest = {
      prompt,
      top: 20,
      scope,
      sources: used,
      ...(convoRef.current ? { conversation_id: convoRef.current } : {}),
    };
    const r = await api<AiSearchResponse>('/ai/search', {
      method: 'POST',
      body,
      signal: ctrl.signal,
    });
    window.clearTimeout(timer);
    if (abortRef.current !== ctrl) return;

    if (r.ok) {
      patch(id, { status: 'done', data: r.data });
      // Conversa nova: a resposta traz o id. A URL passa a apontar para ela (sem recarregar, para não perder a
      // tela) e a lista "Recentes" da barra lateral se relê.
      if (!convoRef.current && r.data.conversation_id) {
        convoRef.current = r.data.conversation_id;
        window.history.replaceState(window.history.state, '', `/chat?c=${r.data.conversation_id}`);
      }
      notifyConversations();
      const keep: Saved = { prompt, at: r.at, data: r.data };
      setSaved(keep);
      try {
        window.localStorage.setItem(LAST_KEY, JSON.stringify(keep));
      } catch {
        /* resultado grande demais ou armazenamento bloqueado: segue sem salvar */
      }
    } else if (cancelRef.current) {
      patch(id, { status: 'cancelled' });
    } else if (timedOut) {
      patch(id, { status: 'error', failure: AI_TIMEOUT_FAILURE });
    } else {
      patch(id, { status: 'error', failure: aiFailure(r) });
    }
  }

  function cancel() {
    cancelRef.current = true;
    abortRef.current?.abort();
  }

  // Vindo de um atalho (`/chat?q=...`) a pesquisa começa sozinha, uma única vez.
  // biome-ignore lint/correctness/useExhaustiveDependencies: roda só na montagem
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    if (initialPrompt.trim().length >= MIN_LEN) void run(initialPrompt);
  }, []);

  const empty = turns.length === 0;

  const composer = (
    <>
      <form
        className="rg-composer"
        data-aura=""
        onSubmit={(e) => {
          e.preventDefault();
          void run(text);
        }}
      >
        <label htmlFor="chat-q" className={s.sr}>
          Descreva o que você procura
        </label>
        <textarea
          id="chat-q"
          ref={areaRef}
          className="rg-composer-input"
          rows={2}
          value={text}
          maxLength={MAX_LEN}
          placeholder="Pergunte sobre editais, prazos, preços ou lei"
          aria-describedby="chat-note"
          onChange={(e) => {
            setText(e.target.value);
            if (hint) setHint(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void run(text);
            }
          }}
        />
        <div className={`rg-composer-bar ${s.bar}`}>
          <button
            type="button"
            className="rg-icon-btn"
            aria-label="Anexar PDF do edital"
            aria-disabled="true"
            title="Em breve"
            onClick={(e) => e.preventDefault()}
          >
            <Clip />
          </button>
          <button
            type="button"
            className="rg-chip"
            aria-pressed={modes.pncp}
            onClick={() => toggle('pncp')}
          >
            PNCP
          </button>
          <button
            type="button"
            className="rg-chip"
            aria-pressed={modes.web}
            onClick={() => toggle('web')}
          >
            Web
          </button>
          <select
            className={s.scope}
            aria-label="Buscar em"
            value={scope}
            disabled={loading}
            onChange={(e) => setScope(e.target.value as Scope)}
          >
            <option value="all">Em vigor e em andamento</option>
            <option value="open">Só em vigor</option>
          </select>
          {noMode ? (
            <span className={`rg-src rg-src-model ${s.noMode}`} title="Ligue PNCP ou Web">
              Sem busca
            </span>
          ) : null}
          <span className="rg-spacer" />
          {loading ? (
            <button
              type="button"
              className={`rg-send ${s.sendBusy}`}
              aria-label="Cancelar pesquisa"
              onClick={cancel}
            >
              <Stop />
            </button>
          ) : (
            <button type="submit" className="rg-send" aria-label="Enviar" disabled={!canSend}>
              <Up />
            </button>
          )}
        </div>
      </form>
      <p id="chat-note" className={s.dockNote} data-alert={hint || noMode ? '' : undefined}>
        {hint ??
          (noMode
            ? 'Sem busca ligada, a Régua não tem em que pesquisar. Ligue PNCP, Web ou os dois.'
            : 'Enter envia, Shift+Enter quebra a linha. A resposta pode estar desatualizada: confira no edital.')}
      </p>
    </>
  );

  return (
    <div className={s.chat}>
      <div className={s.column}>
        {empty ? (
          <div className={s.empty}>
            <h1 className="rg-greeting">{greeting}</h1>
            {composer}
            <div className="rg-suggests">
              {SUGGESTIONS.map((q) => (
                <button
                  type="button"
                  className="rg-suggest"
                  key={q}
                  onClick={() => {
                    setText(q);
                    setHint(null);
                    areaRef.current?.focus();
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className={s.thread}>
              {title ? <h1 className={s.convoTitle}>{title}</h1> : null}
              {turns.map((t) => (
                <div className={s.turn} key={t.id}>
                  <div className="rg-msg-user">{t.prompt}</div>
                  {t.status === 'loading' ? (
                    <Working modes={t.modes} startedAt={t.startedAt} />
                  ) : null}
                  {t.status === 'unanswered' ? (
                    <div className="rg-msg-ai">
                      <p>Esta pergunta ficou sem resposta salva.</p>
                      <button
                        type="button"
                        className="rg-btn"
                        disabled={loading}
                        onClick={() => void run(t.prompt)}
                      >
                        Perguntar de novo
                      </button>
                    </div>
                  ) : null}
                  {t.status === 'cancelled' ? (
                    <div className="rg-msg-ai">
                      <p>Pesquisa cancelada.</p>
                    </div>
                  ) : null}
                  {t.status === 'error' ? (
                    <div className="rg-msg-ai">
                      <div className="rg-banner rg-banner-error" role="alert">
                        <div className="rg-banner-body">
                          <p className="rg-banner-title">{t.failure.title}</p>
                          <p>{t.failure.detail}</p>
                        </div>
                        {t.failure.retryable ? (
                          <button
                            type="button"
                            className={`rg-btn ${s.bannerBtn}`}
                            disabled={loading}
                            onClick={() => void run(t.prompt)}
                          >
                            Tentar de novo
                          </button>
                        ) : null}
                      </div>
                      {saved ? (
                        <details style={{ marginTop: 'var(--space-3)' }}>
                          <summary className={s.savedLast}>
                            Último resultado salvo, de {fmtDateTime(saved.at)}: “{saved.prompt}”
                          </summary>
                          <ChatAnswer
                            data={saved.data}
                            pncp
                            web
                            onChangePrompt={() => areaRef.current?.focus()}
                          />
                        </details>
                      ) : null}
                    </div>
                  ) : null}
                  {t.status === 'done' ? (
                    <>
                      <p className={s.sr} role="status" aria-live="polite">
                        Avaliação pronta: {t.data.results.length}{' '}
                        {t.data.results.length === 1 ? 'edital' : 'editais'}.
                      </p>
                      <ChatAnswer
                        data={t.data}
                        pncp={t.modes.pncp}
                        web={t.modes.web}
                        onChangePrompt={() => {
                          areaRef.current?.focus();
                          areaRef.current?.scrollIntoView({ block: 'center' });
                        }}
                      />
                    </>
                  ) : null}
                </div>
              ))}
            </div>
            <div className={s.dock}>{composer}</div>
          </>
        )}
      </div>
    </div>
  );
}
