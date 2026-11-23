'use client';

import type {
  GenerateLegalPieceRequest,
  LegalKind,
  LegalPiece,
  ProcurementDetail,
} from '@agora/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { callLong } from '@/lib/call';
import type { Failure } from '@/lib/failure';
import { KIND_EXAMPLE, KIND_HELP, KIND_LABEL, KINDS } from '@/lib/legal';
import { Icon } from '../Icon';
import { DeadlineRuler, Notice, StateBlock } from '../ui';
import s from './recursos.module.css';

type Step = 'kind' | 'facts' | 'review';
type Gen = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; failure: Failure };

const TIMEOUT_MS = 100_000;
/** A API só responde no final: as etapas abaixo são uma estimativa pelo tempo, e a tela diz isso. */
const PHASE_SWITCH_S = 15;

/**
 * Nova peça em 3 passos curtos: 1) tipo e edital; 2) o que aconteceu; 3) revisar e gerar.
 * O servidor pesquisa fontes oficiais e redige; a IA nunca decide prazo (o servidor calcula).
 */
export function NewLegalPiece({
  edital,
  initialKind,
}: {
  edital: ProcurementDetail;
  initialKind: LegalKind | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('kind');
  const [kind, setKind] = useState<LegalKind>(initialKind ?? 'impugnation');
  const [facts, setFacts] = useState('');
  const [clauses, setClauses] = useState('');
  const [objective, setObjective] = useState('');
  const [gen, setGen] = useState<Gen>({ kind: 'idle' });
  const [seconds, setSeconds] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const factsOk = facts.trim().length >= 10;
  const loading = gen.kind === 'loading';

  useEffect(() => {
    if (!loading) return;
    setSeconds(0);
    const t = window.setInterval(() => setSeconds((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, [loading]);

  async function generate() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setGen({ kind: 'loading' });
    const body: GenerateLegalPieceRequest = {
      procurement_id: edital.id,
      kind,
      facts: facts.trim(),
      ...(clauses.trim() ? { clauses: clauses.trim() } : {}),
      ...(objective.trim() ? { objective: objective.trim() } : {}),
    };
    const r = await callLong<LegalPiece>(
      '/ai/legal-pieces',
      { method: 'POST', body },
      { signal: ctrl.signal, timeoutMs: TIMEOUT_MS },
    );
    if (abortRef.current !== ctrl) return;
    if (r.ok) router.push(`/recursos/${r.data.id}`);
    else if (r.cancelled) setGen({ kind: 'idle' });
    else setGen({ kind: 'error', failure: r.failure });
  }

  const title = edital.edital_number
    ? `${edital.modality.name} ${edital.edital_number}/${edital.year}`
    : edital.numero_controle_pncp;

  return (
    <div className={s.stack}>
      <ol className={s.steps} aria-label="Passos">
        {(
          [
            ['kind', 'Tipo e edital'],
            ['facts', 'O que aconteceu'],
            ['review', 'Revisar e gerar'],
          ] as const
        ).map(([key, label], i) => {
          const order = ['kind', 'facts', 'review'];
          const state =
            key === step ? 'active' : order.indexOf(key) < order.indexOf(step) ? 'done' : 'pending';
          return (
            <li className={s.step} data-state={state} key={key}>
              <span className={s.stepDot}>
                {state === 'done' ? <Icon name="check" size={12} /> : i + 1}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      {step === 'kind' ? (
        <>
          <fieldset className={s.kinds} aria-label="Tipo da peça">
            {KINDS.map((k) => (
              <label className={s.kind} key={k}>
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                />
                <span className={s.kindName}>{KIND_LABEL[k]}</span>
                <span className={s.note}>{KIND_HELP[k]}</span>
              </label>
            ))}
          </fieldset>

          <section className="wk-panel" aria-label="Edital escolhido">
            <div className={s.edital}>
              <p className="wk-meta">
                {title} · {edital.organ.name}
                {edital.organ.uf ? ` · ${edital.organ.uf}` : ''}
              </p>
              <p className={s.editalObject}>{edital.object}</p>
              <DeadlineRuler deadline={edital.deadline} />
              <p>
                <Link className="wk-link" href={`/editais/${edital.id}`}>
                  Ver o edital
                </Link>
                {' · '}
                <Link className="wk-link" href="/recursos/novo">
                  Trocar de edital
                </Link>
              </p>
            </div>
          </section>

          <div className={s.actions}>
            <button
              type="button"
              className="rg-btn rg-btn-primary"
              onClick={() => setStep('facts')}
            >
              Continuar <Icon name="arrowRight" size={14} />
            </button>
          </div>
        </>
      ) : null}

      {step === 'facts' ? (
        <section className={s.stack} aria-labelledby="facts-h">
          <h2 id="facts-h" style={{ fontSize: '18px', fontWeight: 500 }}>
            O que aconteceu
          </h2>
          <div className="wk-field">
            <label htmlFor="lp-facts">Fatos (obrigatório)</label>
            <textarea
              id="lp-facts"
              className={s.facts}
              rows={6}
              maxLength={4000}
              value={facts}
              placeholder={KIND_EXAMPLE[kind]}
              onChange={(e) => setFacts(e.target.value)}
              aria-describedby="lp-facts-help"
            />
            <span className="wk-help" id="lp-facts-help">
              Conte com suas palavras, com datas e itens do edital. A IA não inventa fatos: o que
              faltar vira [PREENCHER]. {facts.trim().length}/4000
              {facts.trim().length > 0 && !factsOk ? ' · escreva pelo menos 10 caracteres' : ''}
            </span>
          </div>
          <div className="wk-field">
            <label htmlFor="lp-clauses">Cláusulas ou ato contestado (opcional)</label>
            <textarea
              id="lp-clauses"
              rows={3}
              maxLength={2000}
              value={clauses}
              placeholder="Ex.: item 8.3 do edital; decisão da sessão de 12/11."
              onChange={(e) => setClauses(e.target.value)}
            />
          </div>
          <div className="wk-field">
            <label htmlFor="lp-objective">O que você quer obter (opcional)</label>
            <textarea
              id="lp-objective"
              rows={2}
              maxLength={1000}
              value={objective}
              placeholder="Ex.: retirar a exigência; reverter a desclassificação."
              onChange={(e) => setObjective(e.target.value)}
            />
          </div>
          <div className={s.actions}>
            <button type="button" className="rg-btn" onClick={() => setStep('kind')}>
              <Icon name="arrowLeft" size={14} /> Voltar
            </button>
            <button
              type="button"
              className="rg-btn rg-btn-primary"
              disabled={!factsOk}
              onClick={() => setStep('review')}
            >
              Continuar <Icon name="arrowRight" size={14} />
            </button>
          </div>
        </section>
      ) : null}

      {step === 'review' ? (
        <section className={s.stack} aria-labelledby="rev-h">
          <h2 id="rev-h" style={{ fontSize: '18px', fontWeight: 500 }}>
            Revisar e gerar
          </h2>
          <dl className={s.review}>
            <div>
              <dt>Tipo</dt>
              <dd>{KIND_LABEL[kind]}</dd>
            </div>
            <div>
              <dt>Edital</dt>
              <dd>
                {title} · {edital.organ.name}
              </dd>
            </div>
            <div>
              <dt>Fatos</dt>
              <dd>{facts.trim()}</dd>
            </div>
            {clauses.trim() ? (
              <div>
                <dt>Cláusulas ou ato</dt>
                <dd>{clauses.trim()}</dd>
              </div>
            ) : null}
            {objective.trim() ? (
              <div>
                <dt>O que você quer obter</dt>
                <dd>{objective.trim()}</dd>
              </div>
            ) : null}
          </dl>

          <Notice>
            Rascunho gerado por IA com fontes da internet. Revise com o jurídico antes de usar.
          </Notice>

          {loading ? (
            <div className={s.progress} aria-busy="true">
              <div className={s.progressHead}>
                <p style={{ fontWeight: 500 }}>Gerando o rascunho…</p>
                <button
                  type="button"
                  className="rg-btn wk-sm"
                  onClick={() => abortRef.current?.abort()}
                >
                  Cancelar
                </button>
              </div>
              <ol className={s.phases}>
                <li className={s.phase} data-state={seconds < PHASE_SWITCH_S ? 'active' : 'done'}>
                  {seconds < PHASE_SWITCH_S ? (
                    <span className={s.pulse} aria-hidden="true" />
                  ) : (
                    <Icon name="check" size={14} />
                  )}
                  Pesquisando fontes oficiais
                </li>
                <li
                  className={s.phase}
                  data-state={seconds < PHASE_SWITCH_S ? 'pending' : 'active'}
                >
                  {seconds < PHASE_SWITCH_S ? null : (
                    <span className={s.pulse} aria-hidden="true" />
                  )}
                  Redigindo a minuta
                </li>
              </ol>
              <p className="wk-sr-only" role="status" aria-live="polite">
                Gerando a peça. Isso leva de 30 a 100 segundos.
              </p>
              <p className={s.note}>
                Leva de 30 a 100 segundos. As etapas acima são uma estimativa pelo tempo: o servidor
                responde só no final.
              </p>
            </div>
          ) : null}

          {gen.kind === 'error' ? (
            <StateBlock kind="error" title={gen.failure.title}>
              {gen.failure.detail}
            </StateBlock>
          ) : null}

          <div className={s.actions}>
            <button
              type="button"
              className="rg-btn"
              onClick={() => setStep('facts')}
              disabled={loading}
            >
              <Icon name="arrowLeft" size={14} /> Voltar
            </button>
            <button
              type="button"
              className="rg-btn rg-btn-primary"
              onClick={generate}
              disabled={loading}
            >
              <Icon name="sparkle" size={14} /> {loading ? 'Gerando…' : 'Gerar rascunho'}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
