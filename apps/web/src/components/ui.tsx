import type { Deadline } from '@agora/contracts';
import type { ReactNode } from 'react';
import { fmtTime } from '@/lib/format';
import { Icon } from './Icon';

const DAYS = 14;
const TZ = 'America/Sao_Paulo';

/** Dia do mês e fim de semana de cada coluna da faixa, a partir da data de hoje que o servidor mandou. Só rótulo. */
function dayHeads(todayIso: string): { n: string; weekend: boolean }[] {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(todayIso));
  const base = new Date(`${ymd}T12:00:00Z`);
  return Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(base.getTime() + i * 86_400_000);
    const wd = d.getUTCDay();
    return { n: String(d.getUTCDate()).padStart(2, '0'), weekend: wd === 0 || wd === 6 };
  });
}

/**
 * Régua de prazos (design Régua): faixa de 14 dias a partir de hoje; cada edital é uma barra até o encerramento.
 * Hoje é a linha de 1px à esquerda. Os dias até o encerramento (`calendar_days`) e o texto (`label`) vêm do servidor.
 * O texto sempre diz o prazo: a cor só reforça. Prazo encerrado não tem barra.
 */
export function DeadlineRuler({
  deadline,
  bar = true,
  mini = false,
  today,
}: {
  deadline: Deadline;
  bar?: boolean;
  /** Versão de 10px para cartões, listas e tabelas. */
  mini?: boolean;
  /** `server_now` da leitura; sem ele a faixa não mostra os números dos dias. */
  today?: string | null;
}) {
  const days = deadline.calendar_days;
  const closed = deadline.level === 'closed';
  const showBar = bar && days !== null && !closed && deadline.level !== 'unknown';
  const over = showBar && days > DAYS - 1;
  const width = showBar ? Math.min(DAYS, Math.max(0, days) + 1) / DAYS : 0;
  const tone =
    deadline.level === 'critical' || (days !== null && days <= 3) ? 'warning' : undefined;
  const heads = !mini && showBar && today ? dayHeads(today) : null;

  return (
    <div className={`rg-ruler ${mini ? 'rg-ruler-mini' : ''}`} data-level={deadline.level}>
      {heads ? (
        <div className="rg-ruler-days" aria-hidden="true">
          {heads.map((h) => (
            <span key={h.n} data-weekend={h.weekend || undefined}>
              {h.n}
            </span>
          ))}
        </div>
      ) : null}
      {showBar ? (
        <div className="rg-ruler-row" aria-hidden="true">
          <div
            className="rg-ruler-bar"
            data-tone={tone}
            style={{ width: `${Math.round(width * 1000) / 10}%` }}
          />
          <div className="rg-ruler-today" />
          {over ? <span className="rulerMore">+</span> : null}
        </div>
      ) : null}
      <div className="rg-ruler-cap" data-closed={closed || undefined}>
        <span>{deadline.label}</span>
      </div>
    </div>
  );
}

type PillTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

/** Etiqueta de estado (rg-tag): ponto + texto; a cor reforça, a palavra diz. */
export function Pill({
  tone = 'neutral',
  children,
  title,
}: {
  tone?: PillTone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className="pill" data-tone={tone} title={title}>
      {children}
    </span>
  );
}

/** Dado ausente: traço em muted. Zero é 0; ausência é traço. */
export function Dash({ why = 'Não informado' }: { why?: string }) {
  return (
    <span className="dash" role="img" aria-label={why} title={why}>
      —
    </span>
  );
}

/** Selo de conteúdo de IA (docs/14 §6). */
export function AiSeal({ children = 'Rascunho gerado por IA' }: { children?: ReactNode }) {
  return (
    <span className="aiSeal">
      <Icon name="sparkle" size={12} />
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  lead,
  actions,
  stamp,
  crumb,
}: {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
  /** ISO do relógio do servidor (`server_now`) da leitura que montou a tela. Sem ele, nada é exibido. */
  stamp?: string | null;
  crumb?: ReactNode;
}) {
  return (
    <header className="pageHead">
      <div className="pageHeadText">
        {crumb ? <div className="crumb">{crumb}</div> : null}
        <h1>{title}</h1>
        {lead ? <p className="lead">{lead}</p> : null}
      </div>
      <div className="pageHeadActions">
        {stamp ? <span className="stamp">Atualizado às {fmtTime(stamp)}</span> : null}
        {actions}
      </div>
    </header>
  );
}

type BlockKind = 'empty' | 'error' | 'degraded';

/** Estados de bloco: mantém a moldura, uma frase e a ação (faixa rg-banner; vazio é moldura com contagem 0). */
export function StateBlock({
  kind,
  title,
  children,
  action,
}: {
  kind: BlockKind;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="stateBlock" data-kind={kind} role={kind === 'error' ? 'alert' : undefined}>
      <Icon name={kind === 'error' ? 'alert' : kind === 'degraded' ? 'info' : 'search'} size={16} />
      <div className="stateText">
        <p className="stateTitle">{title}</p>
        {children ? <p className="stateDesc">{children}</p> : null}
      </div>
      {action ? <div className="stateAction">{action}</div> : null}
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice" role="status">
      <Icon name="info" size={16} />
      <p>{children}</p>
    </div>
  );
}

/** Carregando: o layout final com barras cinza no tamanho real, sem brilho nem deslocamento. */
export function Skeleton({ w = '100%', h = 16 }: { w?: string | number; h?: number }) {
  return <span className="skel" style={{ width: w, height: h }} aria-hidden="true" />;
}

export function SkeletonRows({
  rows = 5,
  label = 'Carregando',
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div className="skelList" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: linhas estáticas de carregamento
        <div className="skelRow" key={i}>
          <div className="skelMain">
            <Skeleton h={18} w="82%" />
            <Skeleton h={14} w="46%" />
          </div>
          <div className="skelSide">
            <Skeleton h={16} w="70%" />
            <Skeleton h={10} w="100%" />
          </div>
        </div>
      ))}
    </div>
  );
}
