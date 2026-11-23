import type { Deadline } from '@agora/contracts';

/**
 * Feriados NACIONAIS (docs/04 §4). Municipais e estaduais não entram: o prazo é indicativo e o texto diz "dias úteis".
 * Datas no formato YYYY-MM-DD. Estender a lista a cada ano.
 */
export const NATIONAL_HOLIDAYS = new Set([
  '2026-01-01',
  '2026-04-03',
  '2026-04-21',
  '2026-05-01',
  '2026-09-07',
  '2026-10-12',
  '2026-11-02',
  '2026-11-15',
  '2026-11-20',
  '2026-12-25',
  '2027-01-01',
  '2027-03-26',
  '2027-04-21',
  '2027-05-01',
  '2027-09-07',
  '2027-10-12',
  '2027-11-02',
  '2027-11-15',
  '2027-11-20',
  '2027-12-25',
]);

const TZ = 'America/Sao_Paulo';
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Partes civis (data e hora) de um instante no fuso de Brasília. */
export function brtParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    dd: get('day'),
    mm: get('month'),
    hh: get('hour'),
    mi: get('minute'),
    weekday,
  };
}

const isBusinessDay = (ymd: string): boolean => {
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6 && !NATIONAL_HOLIDAYS.has(ymd);
};

const addDays = (ymd: string, n: number): string => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Dias corridos de `from` até `to` (negativo se já passou). Alimenta a régua de prazos da tela. */
export function calendarDaysBetween(fromYmd: string, toYmd: string): number {
  return Math.round(
    (new Date(`${toYmd}T12:00:00Z`).getTime() - new Date(`${fromYmd}T12:00:00Z`).getTime()) /
      86_400_000,
  );
}

/** Dias úteis em (de, até]: não conta hoje, conta o dia do encerramento se for útil. 0 se for o mesmo dia ou já passou. */
export function businessDaysBetween(fromYmd: string, toYmd: string): number {
  let n = 0;
  for (let d = addDays(fromYmd, 1); d <= toYmd; d = addDays(d, 1)) if (isBusinessDay(d)) n++;
  return n;
}

/**
 * Prazo de propostas, calculado SEMPRE no servidor (docs/04 §4). Níveis: encerrado; crítico (hoje ou amanhã útil);
 * em breve (até 5 dias úteis); ok. O texto sempre diz o prazo: a cor só reforça.
 */
export function computeDeadline(opensAt: Date | null, closesAt: Date | null, now: Date): Deadline {
  if (!closesAt) {
    return {
      level: 'unknown',
      label: 'prazo não informado',
      business_days: null,
      calendar_days: null,
      progress: null,
    };
  }

  const c = brtParts(closesAt);
  const n = brtParts(now);
  const progress =
    opensAt && closesAt > opensAt
      ? Math.min(
          1,
          Math.max(
            0,
            (now.getTime() - opensAt.getTime()) / (closesAt.getTime() - opensAt.getTime()),
          ),
        )
      : null;

  if (closesAt <= now) {
    return {
      level: 'closed',
      label: `encerrado em ${c.dd}/${c.mm}`,
      business_days: 0,
      calendar_days: calendarDaysBetween(n.ymd, c.ymd),
      progress: progress === null ? null : 1,
    };
  }

  const when = `${WEEKDAYS[c.weekday]} ${c.dd}/${c.mm} ${c.hh}:${c.mi}`;
  if (c.ymd === n.ymd) {
    return {
      level: 'critical',
      label: `encerra hoje · ${c.hh}:${c.mi}`,
      business_days: 0,
      calendar_days: 0,
      progress,
    };
  }
  const days = businessDaysBetween(n.ymd, c.ymd);
  const level = days <= 1 ? 'critical' : days <= 5 ? 'soon' : 'ok';
  const unit = days === 1 ? 'dia útil' : 'dias úteis';
  return {
    level,
    label:
      days === 0 ? `encerra ${when} (sem dia útil até lá)` : `encerra em ${days} ${unit} · ${when}`,
    business_days: days,
    calendar_days: calendarDaysBetween(n.ymd, c.ymd),
    progress,
  };
}

/** Data civil (YYYY-MM-DD) n dias úteis ANTES de `ymd` (pula fim de semana e feriados nacionais). */
export function subtractBusinessDays(ymd: string, n: number): string {
  let d = ymd;
  let left = n;
  while (left > 0) {
    d = addDays(d, -1);
    if (isBusinessDay(d)) left--;
  }
  return d;
}
