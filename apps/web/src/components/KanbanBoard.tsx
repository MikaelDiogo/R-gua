'use client';

import type { PipelineCard, PipelineResponse, PipelineState } from '@agora/contracts';
import Link from 'next/link';
import { type DragEvent, type KeyboardEvent, useRef, useState } from 'react';
import { api, newKey } from '@/lib/api';
import { fmtBRL, fmtCompactBRL, readable } from '@/lib/format';
import { slicePage, usePaging } from '@/lib/paging';
import { Icon } from './Icon';
import { Pagination, RangeText } from './Pagination';
import b from './pipeline/board.module.css';
import { CardDetails, type SaveResult } from './pipeline/CardDetails';
import pl from './pipeline/pipeline.module.css';
import { Dash, DeadlineRuler, PageHeader, StateBlock } from './ui';

/**
 * Nomes de exibição (design system Régua). A máquina de estados do servidor não muda; só o rótulo:
 *   descoberto → Descoberto (sem equivalente no design: etapa de entrada, antes da análise)
 *   em_analise → Em análise · em_preparacao → Vou disputar · proposta_enviada → Proposta enviada
 *   em_disputa → Em disputa · ganho → Homologada · perdido → Perdida
 *   desistencia → Desistência · descartado → Descartado
 * "Recurso em prazo" existe no design, mas o servidor ainda não tem esse estado.
 */
const STATE_LABEL: Record<PipelineState, string> = {
  descoberto: 'Descoberto',
  em_analise: 'Em análise',
  em_preparacao: 'Vou disputar',
  proposta_enviada: 'Proposta enviada',
  em_disputa: 'Em disputa',
  ganho: 'Homologada',
  perdido: 'Perdida',
  desistencia: 'Desistência',
  descartado: 'Descartado',
};
const TAG_TONE: Partial<Record<PipelineState, string>> = {
  ganho: ' rg-tag-success',
  perdido: ' rg-tag-error',
  proposta_enviada: ' rg-tag-accent',
  em_disputa: ' rg-tag-accent',
};
const AVATAR_TONES = ['clay', 'sky', 'rose', 'moss', 'sand', 'slate'] as const;
/** Tom estável por pessoa: o mesmo nome sempre cai no mesmo tom. */
const toneOf = (name: string) =>
  AVATAR_TONES[
    [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_TONES.length
  ];
const initials = (name: string) =>
  name
    .split(/s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

/** Ordem do quadro (as 5 etapas de trabalho e os 2 resultados), usada também pelo teclado (Alt + ←/→). */
const ORDER: PipelineState[] = [
  'descoberto',
  'em_analise',
  'em_preparacao',
  'proposta_enviada',
  'em_disputa',
  'ganho',
  'perdido',
];
/** Fora do quadro: ficam na lista "Encerrados". */
const OFFBOARD: PipelineState[] = ['desistencia', 'descartado'];
/** Filtro de prazo: o nível vem pronto do servidor (deadline.level); a tela não calcula prazo. */
type Due = 'todos' | 'critical' | 'soon' | 'ok' | 'closed' | 'unknown';
const DUE_LABEL: Record<Due, string> = {
  todos: 'Todos',
  critical: 'Crítico (hoje ou amanhã)',
  soon: 'Em breve (até 5 dias úteis)',
  ok: 'Em dia',
  closed: 'Encerrado',
  unknown: 'Sem prazo informado',
};

interface Problem {
  code: string;
  title: string;
  detail: string;
}

export interface BoardError {
  title: string;
  detail: string;
}

export function KanbanBoard({
  initial,
  error,
}: {
  initial: PipelineResponse | null;
  error: BoardError | null;
}) {
  const [cards, setCards] = useState<PipelineCard[]>(initial?.cards ?? []);
  const [pending, setPending] = useState<Record<string, true>>({});
  const [problems, setProblems] = useState<Record<string, Problem>>({});
  const [announce, setAnnounce] = useState('');
  const [who, setWho] = useState('Todos');
  const [due, setDue] = useState<Due>('todos');
  const [query, setQuery] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<PipelineState | 'encerrados' | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);
  const paging = usePaging({ page: 'pagina_encerrados', size: 'por_pagina' });

  const label = (s: PipelineState) => STATE_LABEL[s];

  const header = (
    <PageHeader
      title="Funil"
      stamp={initial?.server_now}
      actions={
        <Link href="/busca" className="rg-btn rg-btn-primary">
          <Icon name="search" size={14} /> Buscar editais
        </Link>
      }
    />
  );

  if (error || !initial) {
    return (
      <>
        {header}
        <StateBlock
          kind="error"
          title={error?.title ?? 'Não foi possível carregar o funil.'}
          action={
            <Link href="/pipeline" className="rg-btn wk-sm">
              <Icon name="refresh" size={14} /> Tentar de novo
            </Link>
          }
        >
          {error?.detail ?? 'Seus cards continuam salvos no servidor.'}
        </StateBlock>
      </>
    );
  }

  const assignees = [...new Set(cards.map((c) => c.assignee).filter((a): a is string => !!a))].sort(
    (a, b) => a.localeCompare(b, 'pt-BR'),
  );
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const q = fold(query.trim());
  const visible = cards.filter((c) => {
    if (who !== 'Todos' && (who === 'Sem responsável' ? c.assignee : c.assignee !== who)) {
      return false;
    }
    if (due !== 'todos' && c.procurement.deadline.level !== due) return false;
    if (!q) return true;
    const p = c.procurement;
    return fold(`${p.object} ${p.organ.name} ${p.numero_controle_pncp}`).includes(q);
  });

  const replaceCard = (next: PipelineCard) =>
    setCards((cs) => cs.map((c) => (c.id === next.id ? next : c)));

  /** Comando `move`: otimista, e o servidor decide. Recusa devolve o card e mostra o problema (docs/04 §2). */
  async function move(id: string, to: PipelineState) {
    const card = cards.find((c) => c.id === id);
    if (!card || card.state === to || pending[id]) return;
    setProblems(({ [id]: _drop, ...rest }) => rest);
    setCards((cs) => [{ ...card, state: to }, ...cs.filter((c) => c.id !== id)]);
    setPending((p) => ({ ...p, [id]: true }));
    setAnnounce(`Movendo para ${label(to)}…`);

    const r = await api<PipelineCard>(`/pipeline/cards/${id}/commands/move`, {
      method: 'POST',
      headers: { 'Idempotency-Key': newKey(), 'If-Match': String(card.version) },
      body: { to_state: to },
    });
    setPending(({ [id]: _drop, ...rest }) => rest);

    if (r.ok) {
      replaceCard(r.data);
      setAnnounce(`Card movido para ${label(to)}.`);
      return;
    }
    const problem: Problem = {
      code: r.problem?.code ?? (r.unreachable ? 'unreachable' : 'error'),
      title: r.unreachable
        ? 'Sem conexão com o servidor'
        : (r.problem?.title ?? 'O servidor recusou o movimento'),
      detail: r.unreachable
        ? 'O card voltou para onde estava. Tente de novo.'
        : (r.problem?.detail ?? ''),
    };
    // Reverte para o estado de antes do movimento.
    setCards((cs) => cs.map((c) => (c.id === id ? card : c)));
    setProblems((p) => ({ ...p, [id]: problem }));
    setAnnounce(`${problem.title}. ${problem.detail}`);
    if (problem.code === 'version_conflict') {
      // Alguém mexeu no card: busca o estado atual de todo o quadro.
      const fresh = await api<PipelineResponse>('/pipeline');
      if (fresh.ok) setCards(fresh.data.cards);
    }
  }

  /** PATCH com If-Match. Conflito de versão: recarrega o quadro e devolve o aviso; o texto da pessoa fica na tela. */
  async function saveCard(
    card: PipelineCard,
    patch: { assignee?: string | null; notes?: string | null },
  ): Promise<SaveResult> {
    const r = await api<PipelineCard>(`/pipeline/cards/${card.id}`, {
      method: 'PATCH',
      headers: { 'If-Match': String(card.version) },
      body: patch,
    });
    if (r.ok) {
      replaceCard(r.data);
      return { ok: true };
    }
    if (r.problem?.code === 'version_conflict') {
      const fresh = await api<PipelineResponse>('/pipeline');
      if (fresh.ok) setCards(fresh.data.cards);
      return {
        ok: false,
        message:
          'Outra pessoa alterou este card. Recarreguei a versão atual; o seu texto foi mantido: confira e salve de novo.',
      };
    }
    return {
      ok: false,
      message: r.unreachable
        ? 'Sem conexão com o servidor. Nada foi salvo; tente de novo.'
        : [r.problem?.title, r.problem?.detail].filter(Boolean).join(' ') ||
          'Não foi possível salvar.',
    };
  }

  async function saveAssignee(card: PipelineCard, value: string) {
    setEditing(null);
    const next = value.trim() || null;
    if (next === card.assignee) return;
    const r = await saveCard(card, { assignee: next });
    if (!r.ok) {
      setProblems((p) => ({
        ...p,
        [card.id]: {
          code: 'save_failed',
          title: 'Não foi possível salvar o responsável',
          detail: r.message ?? '',
        },
      }));
    }
  }

  const onKey = (e: KeyboardEvent<HTMLElement>, card: PipelineCard) => {
    if (!e.altKey) return;
    const i = ORDER.indexOf(card.state);
    if (i === -1) return;
    const to =
      e.key === 'ArrowRight' ? ORDER[i + 1] : e.key === 'ArrowLeft' ? ORDER[i - 1] : undefined;
    if (!to) return;
    e.preventDefault();
    void move(card.id, to);
  };

  // ── Arrastar e soltar (HTML5 nativo). O mesmo fluxo existe por seletor e por teclado.
  const onDragStart = (e: DragEvent<HTMLElement>, id: string) => {
    // Selecionar texto numa nota não pode virar arrasto do card.
    if ((e.target as HTMLElement).closest('input, textarea')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    // Síncrono, para a imagem do arrasto já sair "levantada"; o original fica esmaecido logo em seguida.
    e.currentTarget.dataset.lifted = 'true';
    dragRef.current = id;
    window.setTimeout(() => setDragId(id), 0);
  };
  const onDragEnd = (e: DragEvent<HTMLElement>) => {
    delete e.currentTarget.dataset.lifted;
    dragRef.current = null;
    setDragId(null);
    setOver(null);
  };
  const dropProps = (target: PipelineState | 'encerrados') => ({
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!dragRef.current) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (over !== target) setOver(target);
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
        setOver((o) => (o === target ? null : o));
      }
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      const id = dragRef.current ?? e.dataTransfer.getData('text/plain');
      setOver(null);
      if (id) void move(id, target === 'encerrados' ? 'descartado' : target);
    },
  });

  const active = cards.filter(
    (c) => !['ganho', 'perdido', 'desistencia', 'descartado'].includes(c.state),
  );
  const urgent = active.filter(
    (c) => c.procurement.deadline.level === 'critical' || c.procurement.deadline.level === 'soon',
  ).length;
  const lead =
    cards.length === 0
      ? 'Nenhum edital no funil ainda.'
      : `${active.length} ${active.length === 1 ? 'edital em andamento' : 'editais em andamento'}${urgent ? `, ${urgent} com prazo chegando.` : '.'}`;

  const options = (card: PipelineCard) => (
    <>
      <option value="">Mover para…</option>
      <optgroup label="Etapas">
        {ORDER.filter((s) => s !== card.state).map((s) => (
          <option key={s} value={s}>
            {label(s)}
          </option>
        ))}
      </optgroup>
      <optgroup label="Encerrar como">
        {OFFBOARD.filter((s) => s !== card.state).map((s) => (
          <option key={s} value={s}>
            {label(s)}
          </option>
        ))}
      </optgroup>
    </>
  );

  const renderCard = (card: PipelineCard) => {
    const p = card.procurement;
    const problem = problems[card.id];
    const canDrag = !pending[card.id] && editing !== card.id;
    return (
      <li
        key={card.id}
        className={`rg-card ${b.kcard}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: o card recebe foco para mover com Alt+setas
        tabIndex={0}
        draggable={canDrag}
        data-pending={pending[card.id] || undefined}
        data-overdue={
          p.deadline.level === 'closed' &&
          !OFFBOARD.includes(card.state) &&
          !['ganho', 'perdido'].includes(card.state)
            ? 'true'
            : undefined
        }
        data-dragging={dragId === card.id || undefined}
        data-error={problem ? 'true' : undefined}
        onKeyDown={(ev) => onKey(ev, card)}
        onDragStart={(ev) => onDragStart(ev, card.id)}
        onDragEnd={onDragEnd}
        aria-label={`${p.numero_controle_pncp}, ${p.organ.name}`}
      >
        <Link href={`/editais/${p.id}`} className={`${b.kcardTitle} clamp3`} draggable={false}>
          {readable(p.object)}
        </Link>
        <p className={b.kcardMeta}>
          {p.organ.name}
          {p.organ.uf ? ` · ${p.organ.uf}` : ''}
        </p>
        <div className={`${b.kcardRow}`}>
          <span className={b.kvalue}>
            {p.estimated_value != null ? fmtBRL(p.estimated_value) : <Dash />}
          </span>
          <DeadlineRuler deadline={p.deadline} mini />
        </div>
        <div className={`${b.kcardFoot}`}>
          <div className={`${b.kcardWho}`}>
            {editing === card.id ? (
              <input
                className={`${b.assigneeInput}`}
                // biome-ignore lint/a11y/noAutofocus: o campo abre por ação do usuário
                autoFocus
                aria-label="Responsável"
                defaultValue={card.assignee ?? ''}
                maxLength={120}
                onBlur={(ev) => void saveAssignee(card, ev.currentTarget.value)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') ev.currentTarget.blur();
                  if (ev.key === 'Escape') setEditing(null);
                }}
              />
            ) : (
              <button
                type="button"
                className={`${b.assigneeBtn}`}
                onClick={() => setEditing(card.id)}
                aria-label={`Responsável: ${card.assignee ?? 'nenhum'}. Editar`}
              >
                {card.assignee ? (
                  <>
                    <span
                      className="rg-avatar"
                      data-tone={toneOf(card.assignee)}
                      aria-hidden="true"
                    >
                      {initials(card.assignee)}
                    </span>
                    <span className={b.assigneeName}>{card.assignee}</span>
                  </>
                ) : (
                  'Definir responsável'
                )}
              </button>
            )}
          </div>
          <select
            aria-label={`Mover ${p.numero_controle_pncp} para`}
            value=""
            disabled={Boolean(pending[card.id])}
            onChange={(ev) => void move(card.id, ev.target.value as PipelineState)}
          >
            {options(card)}
          </select>
        </div>
        <CardDetails card={card} onSave={(patch) => saveCard(card, patch)} />
        {problem ? (
          <div className="wk-problem" role="alert">
            <Icon name="alert" size={14} />
            <div>
              <strong>{problem.title}.</strong> {problem.detail}
            </div>
            <button
              type="button"
              aria-label="Dispensar aviso"
              onClick={() => setProblems(({ [card.id]: _d, ...rest }) => rest)}
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        ) : null}
      </li>
    );
  };

  if (cards.length === 0) {
    return (
      <>
        <PageHeader title="Funil" lead={lead} stamp={initial.server_now} />
        <StateBlock
          kind="empty"
          title="Seu funil está vazio."
          action={
            <Link href="/busca" className="rg-btn rg-btn-primary wk-sm">
              <Icon name="search" size={14} /> Buscar editais
            </Link>
          }
        >
          Busque editais e salve no funil para acompanhar prazos e responsáveis.
        </StateBlock>
      </>
    );
  }

  const closed = visible.filter((c) => OFFBOARD.includes(c.state));
  const closedView = slicePage(closed, paging.page, paging.perPage);
  const filtering = who !== 'Todos' || q !== '' || due !== 'todos';
  return (
    <>
      <PageHeader
        title="Funil"
        lead={lead}
        stamp={initial.server_now}
        actions={
          <Link href="/busca" className="rg-btn rg-btn-primary">
            <Icon name="search" size={14} /> Buscar editais
          </Link>
        }
      />

      <div className={`${b.boardTools}`}>
        <div className={`${b.boardSearch}`}>
          <Icon name="search" size={14} />
          <label htmlFor="board-q" className="wk-sr-only">
            Buscar no quadro
          </label>
          <input
            id="board-q"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar no quadro"
            autoComplete="off"
          />
        </div>
        <div className={`${b.aiSelect}`}>
          <label htmlFor="who">Responsável:</label>
          <select id="who" value={who} onChange={(e) => setWho(e.target.value)}>
            {['Todos', ...assignees, 'Sem responsável'].map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </div>
        <div className={`${b.aiSelect} ${pl.filterSelect}`}>
          <label htmlFor="due">Prazo:</label>
          <select id="due" value={due} onChange={(e) => setDue(e.target.value as Due)}>
            {(Object.keys(DUE_LABEL) as Due[]).map((d) => (
              <option key={d} value={d}>
                {DUE_LABEL[d]}
              </option>
            ))}
          </select>
        </div>
        {filtering ? (
          <button
            type="button"
            className="wk-linkbtn"
            onClick={() => {
              setQuery('');
              setWho('Todos');
              setDue('todos');
            }}
          >
            Limpar filtros
          </button>
        ) : null}
        <p className={`wk-hint ${b.boardHint}`}>
          Arraste os cartões entre as etapas ou use “Mover para…”. Com o card em foco:{' '}
          <kbd className="wk-kbd">Alt</kbd> + <kbd className="wk-kbd">←</kbd>
          <kbd className="wk-kbd">→</kbd>
        </p>
      </div>
      <p className="wk-sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      <div className={`${b.boardScroll}`}>
        <div className={`${b.board}`} data-dragging={dragId ? 'true' : undefined}>
          {ORDER.map((stage) => {
            const list = visible.filter((c) => c.state === stage);
            const sum = list.reduce((s, c) => s + (c.procurement.estimated_value ?? 0), 0);
            const noValue = list.filter((c) => c.procurement.estimated_value == null).length;
            return (
              <section
                className={`${b.kcol}`}
                key={stage}
                data-stage={stage}
                data-over={over === stage || undefined}
                aria-labelledby={`col-${stage}`}
                {...dropProps(stage)}
              >
                <div className={`${b.kcolHead}`}>
                  <h2 id={`col-${stage}`}>
                    {label(stage)}
                    <span className={`${b.kcount} wk-num`}>{list.length}</span>
                  </h2>
                  <p
                    className={`${b.ksum} wk-num`}
                    title={
                      noValue > 0
                        ? `Soma dos valores informados; ${noValue} ${noValue === 1 ? 'card' : 'cards'} sem valor no edital.`
                        : 'Soma dos valores estimados dos cards.'
                    }
                  >
                    {sum > 0 ? fmtCompactBRL(sum) : <Dash />}
                    {noValue > 0 && sum > 0 ? (
                      <span className={pl.sumNote}> +{noValue} s/ valor</span>
                    ) : null}
                  </p>
                </div>
                <ul className={`${b.kcards}`}>
                  {list.map(renderCard)}
                  {over === stage && dragId ? (
                    <li className={`${b.kdrop}`} aria-hidden="true">
                      Solte aqui para mover para {label(stage)}
                    </li>
                  ) : null}
                  {list.length === 0 && !(over === stage && dragId) ? (
                    <li className={`${b.kempty}`}>
                      {filtering ? 'Nenhum card com este filtro.' : 'Nenhum card nesta etapa.'}
                    </li>
                  ) : null}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      <section
        className={`wk-panel ${b.closedPanel}`}
        aria-labelledby="closed-h"
        data-over={over === 'encerrados' || undefined}
        {...dropProps('encerrados')}
      >
        <div className="wk-panel-head">
          <h2 id="closed-h">Encerrados</h2>
          <span className="wk-meta" aria-live="polite">
            {over === 'encerrados' && dragId ? (
              'Solte aqui para descartar'
            ) : (
              <RangeText
                from={closedView.from}
                to={closedView.to}
                total={closed.length}
                noun="encerrados"
              />
            )}
          </span>
        </div>
        {closed.length === 0 ? (
          <p className="wk-muted">
            Desistências e descartados aparecem aqui. Arraste um card para cá para descartá-lo.
          </p>
        ) : (
          <ul className={`${b.closedList}`}>
            {closedView.items.map((c) => {
              const p = c.procurement;
              const problem = problems[c.id];
              return (
                <li key={c.id}>
                  <span className={`rg-tag ${TAG_TONE[c.state] ?? ''}`}>{label(c.state)}</span>
                  <div className={`${b.closedMain}`}>
                    <Link href={`/editais/${p.id}`}>{p.object}</Link>
                    <p className="wk-meta">
                      {p.organ.name}
                      {p.organ.uf ? ` · ${p.organ.uf}` : ''}
                    </p>
                    {problem ? (
                      <p className="wk-problem-inline" role="alert">
                        <Icon name="alert" size={14} /> {problem.detail || problem.title}
                      </p>
                    ) : null}
                  </div>
                  <span className={`wk-num ${b.closedValue}`}>
                    {p.estimated_value != null ? fmtBRL(p.estimated_value) : <Dash />}
                  </span>
                  <select
                    aria-label={`Reabrir ${p.numero_controle_pncp}`}
                    value=""
                    disabled={Boolean(pending[c.id])}
                    onChange={(ev) => void move(c.id, ev.target.value as PipelineState)}
                  >
                    {options(c)}
                  </select>
                </li>
              );
            })}
          </ul>
        )}
        {closed.length > 0 ? (
          <Pagination
            id="encerrados"
            page={closedView.page}
            pages={closedView.pages}
            perPage={paging.perPage}
            onPage={paging.setPage}
            onPerPage={paging.setPerPage}
            label="Paginação dos encerrados"
          />
        ) : null}
      </section>
    </>
  );
}
