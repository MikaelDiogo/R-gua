'use client';

import type { Monitor, MonitorIntent, ProcurementSummary, SearchResponse } from '@agora/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { COVERAGE_LABEL, COVERAGE_UFS, UF_NAMES } from '@/lib/coverage';
import { failureOf } from '@/lib/failure';
import { fmtInt, readable } from '@/lib/format';
import { MODALITIES } from '@/lib/modalities';
import { parseBRL, toInputBRL } from '@/lib/money';
import { brtYmd, dayEndIso, dayStartIso, intentParts, suggestName } from '@/lib/monitors';
import { readOrganNames, rememberOrganNames } from '@/lib/organ-names';
import { Icon } from '../Icon';
import { DeadlineRuler, StateBlock } from '../ui';
import { EmailNotice } from './EmailNotice';
import s from './monitores.module.css';

type Filters = MonitorIntent['filters'];
type Uf = (typeof COVERAGE_UFS)[number];

/** Pontos de partida do assistente: vêm da URL ("Criar monitor com esta busca") ou do monitor que está sendo editado. */
export interface WizardInitial {
  q?: string;
  uf?: string[];
  organs?: string[];
  modality?: number[];
  valueMin?: number | null;
  valueMax?: number | null;
  from?: string;
  to?: string;
  onlyOpen?: boolean;
}

export function initialFromMonitor(m: Monitor): WizardInitial {
  const f = m.intent.filters;
  return {
    q: m.intent.q ?? '',
    uf: f.uf ?? [],
    organs: f.organ_cnpj ?? [],
    modality: f.modality ?? [],
    valueMin: f.value?.min ?? null,
    valueMax: f.value?.max ?? null,
    from: f.proposals_deadline?.from ? brtYmd(f.proposals_deadline.from) : '',
    to: f.proposals_deadline?.to ? brtYmd(f.proposals_deadline.to) : '',
    onlyOpen: f.status ? f.status.includes('open_for_proposals') : false,
  };
}

interface OrganOption {
  cnpj: string;
  name: string;
  uf: string | null;
}

const STEPS = ['O que procurar', 'Onde e quanto', 'Como avisar'] as const;

/** Exemplos clicáveis do passo 1: preenchem o campo, a pessoa ainda pode editar. */
const EXAMPLES = [
  'notebook',
  'ar condicionado',
  'merenda escolar',
  'medicamentos',
  'serviços de limpeza',
  'assessoria jurídica',
  'lgpd or "proteção de dados"',
] as const;

/** Explicação curta de cada modalidade, para quem nunca usou. As mais comuns vêm primeiro. */
const MODALITY_HELP: Record<number, string> = {
  6: 'Compra de bens e serviços comuns, pela internet, vence o menor preço.',
  4: 'Obras e compras de maior valor, pela internet.',
  8: 'Compra direta, sem licitação, nos casos que a lei permite.',
  12: 'O órgão aceita todos que cumprirem os requisitos.',
  9: 'Quando só um fornecedor pode atender.',
  7: 'Igual ao pregão eletrônico, mas em sessão presencial.',
  5: 'Igual à concorrência eletrônica, mas em sessão presencial.',
  1: 'Venda de bens do órgão a quem der o maior lance, pela internet.',
  13: 'Venda de bens do órgão, em sessão presencial.',
  2: 'O órgão conversa com empresas para achar a melhor solução.',
  3: 'Escolha de trabalho técnico, científico ou artístico.',
  10: 'O órgão sonda o mercado antes de abrir a licitação.',
  11: 'Cadastro prévio de quem poderá participar.',
};
const COMMON_MODALITIES = [6, 4, 8, 12, 9, 7, 5] as const;
const OTHER_MODALITIES = [1, 13, 2, 3, 10, 11] as const;

type Preview =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; total: number; items: ProcurementSummary[] }
  | { kind: 'error'; message: string };

/** Escolha de órgãos com autocomplete (GET /organs?q=). */
function OrganPicker({
  selected,
  names,
  onChange,
}: {
  selected: string[];
  names: Record<string, string>;
  onChange: (cnpjs: string[], names: Record<string, string>) => void;
}) {
  const [text, setText] = useState('');
  const [found, setFound] = useState<OrganOption[]>([]);
  const [failed, setFailed] = useState(false);
  const q = text.trim();

  useEffect(() => {
    if (q.length < 2) {
      setFound([]);
      setFailed(false);
      return;
    }
    let alive = true;
    const t = window.setTimeout(async () => {
      const r = await api<{ organs: OrganOption[] }>(`/organs?q=${encodeURIComponent(q)}`);
      if (!alive) return;
      setFailed(!r.ok);
      setFound(r.ok ? r.data.organs : []);
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [q]);

  const add = (o: OrganOption) => {
    rememberOrganNames([o]);
    if (!selected.includes(o.cnpj)) onChange([...selected, o.cnpj], { ...names, [o.cnpj]: o.name });
    setText('');
    setFound([]);
  };

  return (
    <div className="wk-field">
      <label htmlFor="mon-organ">Órgão (opcional)</label>
      <div className={s.organBox}>
        <input
          id="mon-organ"
          type="search"
          autoComplete="off"
          placeholder="Digite parte do nome do órgão"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {q.length >= 2 ? (
          <ul className={s.organList} aria-label="Órgãos encontrados">
            {failed ? (
              <li className={s.organNote} role="alert">
                Não foi possível buscar órgãos agora.
              </li>
            ) : found.length === 0 ? (
              <li className={s.organNote}>Nenhum órgão encontrado.</li>
            ) : (
              found.map((o) => (
                <li key={o.cnpj}>
                  <button type="button" onClick={() => add(o)}>
                    <span>{o.name}</span>
                    <small>{o.uf ?? ''}</small>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
      {selected.length > 0 ? (
        <div className={s.chips}>
          {selected.map((c) => (
            <span key={c} className="wk-chip">
              {names[c] ?? c}
              <button
                type="button"
                aria-label={`Remover ${names[c] ?? c}`}
                onClick={() =>
                  onChange(
                    selected.filter((x) => x !== c),
                    names,
                  )
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Assistente de monitor em 3 passos curtos: 1) o que procurar, 2) onde e quanto (com prévia ao vivo do que casa hoje),
 * 3) como avisar. Serve para criar e para editar. Quem procura é o servidor; aqui só montamos o pedido.
 */
export function MonitorWizard({
  monitor,
  initial,
}: {
  /** Presente = modo edição. */
  monitor?: Monitor;
  initial?: WizardInitial;
}) {
  const router = useRouter();
  const start = initial ?? {};
  const [step, setStep] = useState(0);
  const [q, setQ] = useState(start.q ?? '');
  const [uf, setUf] = useState<Uf[]>(
    (start.uf ?? []).filter((u): u is Uf => (COVERAGE_UFS as readonly string[]).includes(u)),
  );
  const [organs, setOrgans] = useState<string[]>(start.organs ?? []);
  const [organNames, setOrganNames] = useState<Record<string, string>>({});
  const [modality, setModality] = useState<number[]>(start.modality ?? []);
  const [valueMin, setValueMin] = useState(toInputBRL(start.valueMin ?? null).replace(/^$/, ''));
  const [valueMax, setValueMax] = useState(toInputBRL(start.valueMax ?? null).replace(/^$/, ''));
  const [from, setFrom] = useState(start.from ?? '');
  const [to, setTo] = useState(start.to ?? '');
  const [onlyOpen, setOnlyOpen] = useState(start.onlyOpen ?? true);
  const [name, setName] = useState(monitor?.name ?? '');
  const [nameTouched, setNameTouched] = useState(Boolean(monitor));
  const [frequency, setFrequency] = useState<'immediate' | 'daily'>(
    monitor?.frequency ?? 'immediate',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [preview, setPreview] = useState<Preview>({ kind: 'idle' });

  // Nomes dos órgãos já vistos neste navegador (o monitor guarda só o CNPJ).
  useEffect(() => setOrganNames((n) => ({ ...readOrganNames(), ...n })), []);

  const valueMinNum = parseBRL(valueMin);
  const valueMaxNum = parseBRL(valueMax);

  // Filtros que o assistente não mostra (município, esfera...) são preservados ao editar.
  const preserved = useMemo(() => {
    if (!monitor) return {} as Filters;
    const {
      uf: _u,
      organ_cnpj: _o,
      modality: _m,
      value: _v,
      proposals_deadline: _p,
      status: _s,
      ...rest
    } = monitor.intent.filters;
    return rest as Filters;
  }, [monitor]);

  const filters = useMemo<Filters>(() => {
    const f: Filters = { ...preserved };
    if (uf.length) f.uf = uf;
    if (organs.length) f.organ_cnpj = organs;
    if (modality.length) f.modality = modality;
    if (valueMinNum !== null || valueMaxNum !== null) {
      f.value = {
        ...(valueMinNum !== null ? { min: valueMinNum } : {}),
        ...(valueMaxNum !== null ? { max: valueMaxNum } : {}),
      };
    }
    if (from || to) {
      f.proposals_deadline = {
        ...(from ? { from: dayStartIso(from) } : {}),
        ...(to ? { to: dayEndIso(to) } : {}),
      };
    }
    if (onlyOpen) f.status = ['open_for_proposals'];
    return f;
  }, [preserved, uf, organs, modality, valueMinNum, valueMaxNum, from, to, onlyOpen]);

  const intent = useMemo<MonitorIntent>(
    () => ({ ...(q.trim() ? { q: q.trim() } : {}), filters, sort: 'published_desc' }),
    [q, filters],
  );
  const parts = intentParts(intent, organNames);
  const hasCriteria = Boolean(q.trim()) || Object.keys(filters).some((k) => k !== 'status');

  // Nome sugerido enquanto a pessoa não escreveu o seu.
  useEffect(() => {
    if (!nameTouched) setName(suggestName(q, parts));
  }, [q, parts, nameTouched]);

  // Prévia ao vivo: quantos editais casam hoje e três exemplos. Falha é falha, nunca "0 editais".
  const previewKey = JSON.stringify(intent);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a chave serializada representa o pedido
  useEffect(() => {
    if (!hasCriteria) {
      setPreview({ kind: 'idle' });
      return;
    }
    let alive = true;
    setPreview({ kind: 'loading' });
    const t = window.setTimeout(async () => {
      const r = await api<SearchResponse>('/search', {
        method: 'POST',
        body: {
          ...(intent.q ? { q: intent.q } : {}),
          filters: intent.filters,
          sort: 'published_desc',
          limit: 3,
        },
      });
      if (!alive) return;
      if (r.ok) setPreview({ kind: 'ok', total: r.data.meta.total_estimate, items: r.data.items });
      else {
        const f = failureOf(r);
        setPreview({ kind: 'error', message: `${f.title} ${f.detail}`.trim() });
      }
    }, 450);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [previewKey, hasCriteria]);

  const toggleUf = (u: Uf) => setUf((c) => (c.includes(u) ? c.filter((x) => x !== u) : [...c, u]));
  const toggleModality = (n: number) =>
    setModality((c) => (c.includes(n) ? c.filter((x) => x !== n) : [...c, n]));

  const rangeInvalid = valueMinNum !== null && valueMaxNum !== null && valueMinNum > valueMaxNum;
  const datesInvalid = Boolean(from && to && from > to);
  const stepError =
    step === 1 && rangeInvalid
      ? 'O valor mínimo é maior que o máximo.'
      : step === 1 && datesInvalid
        ? 'A data inicial é depois da final.'
        : null;

  async function save() {
    if (!hasCriteria) {
      setError('Informe palavras ou ao menos um filtro, para o monitor saber o que procurar.');
      setStep(0);
      return;
    }
    if (!name.trim()) {
      setError('Dê um nome ao monitor.');
      return;
    }
    setSaving(true);
    setError(null);
    setConflict(false);
    const body = { name: name.trim(), intent, frequency, channels: ['app'] as const };
    const r = monitor
      ? await api<Monitor>(`/monitors/${monitor.id}`, {
          method: 'PATCH',
          headers: { 'If-Match': String(monitor.version) },
          body,
        })
      : await api<Monitor>('/monitors', { method: 'POST', body: { ...body, active: true } });
    setSaving(false);
    if (r.ok) {
      router.push(`/monitores/${r.data.id}`);
      router.refresh();
      return;
    }
    const f = failureOf(r);
    setConflict(f.code === 'version_conflict');
    setError(`${f.title} ${f.detail}`.trim());
  }

  return (
    <div className={s.wizard}>
      <section className="wk-panel" aria-label={monitor ? 'Editar monitor' : 'Novo monitor'}>
        <p className={s.stepCount}>
          Passo {step + 1} de {STEPS.length}
        </p>
        <ol className={s.steps} aria-label="Passos">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={s.step}
              data-state={i === step ? 'active' : i < step ? 'done' : undefined}
              aria-current={i === step ? 'step' : undefined}
            >
              <span className={s.stepDot}>{i + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        <div className={s.panelBody}>
          {step === 0 ? (
            <div className={s.stepBlock}>
              <h2 className={s.stepTitle}>O que você quer acompanhar?</h2>
              <p className="wk-help">
                Escreva o objeto que você vende ou procura. Use “or” para aceitar mais de uma
                palavra, por exemplo: notebook or computador.
              </p>
              <label htmlFor="mon-q" className="wk-sr-only">
                Palavras-chave
              </label>
              <div className={`rg-field-shell rg-glass ${s.bigField}`}>
                <Icon name="search" size={18} />
                <input
                  id="mon-q"
                  type="search"
                  autoComplete="off"
                  placeholder="Ex.: notebook, ar condicionado, merenda escolar"
                  value={q}
                  maxLength={500}
                  onChange={(e) => setQ(e.target.value)}
                  aria-describedby="mon-q-help"
                />
              </div>
              <span id="mon-q-help" className="wk-help">
                O monitor avisa quando aparecer edital com essas palavras. Se preferir, deixe em
                branco e use só os filtros do próximo passo.
              </span>
              <div>
                <p className={s.exampleLabel}>Ou comece por um exemplo:</p>
                <div className="rg-suggests">
                  {EXAMPLES.map((ex) => (
                    <button key={ex} type="button" className="rg-suggest" onClick={() => setQ(ex)}>
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <>
              <fieldset className={s.fieldset}>
                <legend>Estado</legend>
                <div className={s.toggles}>
                  {COVERAGE_UFS.map((u) => (
                    <button
                      key={u}
                      type="button"
                      className="rg-btn wk-sm"
                      aria-pressed={uf.includes(u)}
                      aria-label={UF_NAMES[u]}
                      title={UF_NAMES[u]}
                      onClick={() => toggleUf(u)}
                    >
                      {u}
                    </button>
                  ))}
                </div>
                <span className="wk-help">
                  Cobertura: {COVERAGE_LABEL}. Sem escolher nenhum estado, vale Ceará e Piauí.
                </span>
              </fieldset>

              <OrganPicker
                selected={organs}
                names={organNames}
                onChange={(c, n) => {
                  setOrgans(c);
                  setOrganNames(n);
                }}
              />

              <fieldset className={s.fieldset}>
                <legend>Modalidade (opcional)</legend>
                <span className="wk-help">
                  Modalidade é o jeito de disputar. Sem marcar nenhuma, vale qualquer uma.
                </span>
                <ul className={s.modList}>
                  {COMMON_MODALITIES.map((code) => (
                    <li key={code}>
                      <label
                        className={s.modItem}
                        data-checked={modality.includes(code) || undefined}
                      >
                        <input
                          type="checkbox"
                          checked={modality.includes(code)}
                          onChange={() => toggleModality(code)}
                        />
                        <span className={s.radioText}>
                          {MODALITIES[code]}
                          <small>{MODALITY_HELP[code]}</small>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <details className={s.more}>
                  <summary>Outras modalidades</summary>
                  <ul className={s.modList}>
                    {OTHER_MODALITIES.map((code) => (
                      <li key={code}>
                        <label
                          className={s.modItem}
                          data-checked={modality.includes(code) || undefined}
                        >
                          <input
                            type="checkbox"
                            checked={modality.includes(code)}
                            onChange={() => toggleModality(code)}
                          />
                          <span className={s.radioText}>
                            {MODALITIES[code]}
                            <small>{MODALITY_HELP[code]}</small>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </details>
              </fieldset>

              <div className={s.row2}>
                <div className="wk-field">
                  <label htmlFor="mon-vmin">Valor mínimo (R$)</label>
                  <input
                    id="mon-vmin"
                    inputMode="decimal"
                    placeholder="Sem mínimo"
                    value={valueMin}
                    onChange={(e) => setValueMin(e.target.value)}
                  />
                </div>
                <div className="wk-field">
                  <label htmlFor="mon-vmax">Valor máximo (R$)</label>
                  <input
                    id="mon-vmax"
                    inputMode="decimal"
                    placeholder="Sem máximo"
                    value={valueMax}
                    onChange={(e) => setValueMax(e.target.value)}
                  />
                </div>
              </div>

              <div className={s.row2}>
                <div className="wk-field">
                  <label htmlFor="mon-from">Encerramento a partir de</label>
                  <input
                    id="mon-from"
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </div>
                <div className="wk-field">
                  <label htmlFor="mon-to">Encerramento até</label>
                  <input
                    id="mon-to"
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>
              </div>

              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={onlyOpen}
                  onChange={(e) => setOnlyOpen(e.target.checked)}
                />
                Só editais com propostas abertas
              </label>

              {stepError ? (
                <p className="wk-error" role="alert">
                  {stepError}
                </p>
              ) : null}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="wk-field">
                <label htmlFor="mon-name">Nome do monitor</label>
                <input
                  id="mon-name"
                  value={name}
                  maxLength={120}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameTouched(true);
                  }}
                />
              </div>

              <fieldset className={s.fieldset}>
                <legend>Quando avisar</legend>
                <label className={s.radio} data-checked={frequency === 'immediate' || undefined}>
                  <input
                    type="radio"
                    name="freq"
                    checked={frequency === 'immediate'}
                    onChange={() => setFrequency('immediate')}
                  />
                  <span className={s.radioText}>
                    Na hora
                    <small>
                      Cada edital novo ou alterado vira um alerta assim que o monitor roda.
                    </small>
                  </span>
                </label>
                <label className={s.radio} data-checked={frequency === 'daily' || undefined}>
                  <input
                    type="radio"
                    name="freq"
                    checked={frequency === 'daily'}
                    onChange={() => setFrequency('daily')}
                  />
                  <span className={s.radioText}>
                    Resumo diário
                    <small>Os alertas do dia chegam juntos, uma vez por dia.</small>
                  </span>
                </label>
              </fieldset>

              <fieldset className={s.fieldset}>
                <legend>Onde avisar</legend>
                <label className={s.check}>
                  <input type="checkbox" checked readOnly disabled />
                  No sistema (aba Alertas)
                </label>
                <label className={s.check} data-disabled>
                  <input type="checkbox" disabled />
                  E-mail <span className="wk-help">Em breve</span>
                </label>
              </fieldset>

              <EmailNotice />

              <div className={s.review}>
                <strong>O monitor vai procurar:</strong>
                {parts.length ? (
                  <p>{parts.join(' · ')}</p>
                ) : (
                  <p>Todos os editais de {COVERAGE_LABEL}.</p>
                )}
              </div>
            </>
          ) : null}

          {error ? (
            <div className={s.formError} role="alert">
              {error}
              {conflict && monitor ? (
                <>
                  {' '}
                  <Link href={`/monitores/${monitor.id}/editar`}>Recarregar</Link>
                </>
              ) : null}
            </div>
          ) : null}

          <div className={s.nav}>
            {step > 0 ? (
              <button type="button" className="rg-btn" onClick={() => setStep(step - 1)}>
                Voltar
              </button>
            ) : (
              <Link
                className="wk-linkbtn"
                href={monitor ? `/monitores/${monitor.id}` : '/monitores'}
              >
                Cancelar
              </Link>
            )}
            <div className={s.navRight}>
              {step < 2 ? (
                <button
                  type="button"
                  className="rg-btn rg-btn-primary"
                  disabled={step === 1 && (rangeInvalid || datesInvalid)}
                  onClick={() => setStep(step + 1)}
                >
                  Continuar
                </button>
              ) : (
                <button
                  type="button"
                  className="rg-btn rg-btn-primary"
                  onClick={save}
                  disabled={saving}
                >
                  {saving ? 'Salvando…' : monitor ? 'Salvar alterações' : 'Criar monitor'}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <aside
        className={`wk-panel ${s.preview}`}
        aria-label="Prévia do que casa hoje"
        aria-live="polite"
      >
        <h2 className={s.previewTitle}>O que casa hoje</h2>
        {preview.kind === 'idle' ? (
          <p className="wk-muted">
            Escreva palavras ou escolha um filtro. Aqui aparece quantos editais casam hoje e três
            exemplos.
          </p>
        ) : preview.kind === 'loading' ? (
          <p className="wk-muted" role="status">
            Buscando…
          </p>
        ) : preview.kind === 'error' ? (
          <StateBlock kind="error" title="Não foi possível ver a prévia.">
            {preview.message}
          </StateBlock>
        ) : (
          <>
            <p className={s.previewCount}>
              {fmtInt(preview.total)}{' '}
              <small>{preview.total === 1 ? 'edital casa hoje' : 'editais casam hoje'}</small>
            </p>
            {preview.items.length > 0 && preview.total > preview.items.length ? (
              <p className="wk-muted">
                Mostrando {preview.items.length} de {fmtInt(preview.total)}.
              </p>
            ) : null}
            {preview.items.length > 0 ? (
              <ul className={s.previewList}>
                {preview.items.map((it) => (
                  <li key={it.id} className={s.previewItem}>
                    <Link href={`/editais/${it.id}`} target="_blank" rel="noopener noreferrer">
                      {readable(it.object)}
                    </Link>
                    <span className={s.previewMeta}>
                      {it.organ.name}
                      {it.organ.uf ? ` · ${it.organ.uf}` : ''}
                    </span>
                    <DeadlineRuler deadline={it.deadline} bar={false} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="wk-muted">
                Nenhum edital casa hoje. O monitor avisa quando aparecer um.
              </p>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
