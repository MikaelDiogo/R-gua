'use client';

import type { GenerateProposalRequest, ProcurementDetail, Proposal } from '@agora/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { callLong } from '@/lib/call';
import type { Failure } from '@/lib/failure';
import { fmtBRL, fmtDateTime, fmtQty, readableName } from '@/lib/format';
import { parseBRL } from '@/lib/money';
import { useUnsavedGuard } from '@/lib/unsaved';
import { useCollect } from '@/lib/use-collect';
import { Icon } from '../Icon';
import { Dash, Notice, StateBlock } from '../ui';
import s from './propostas.module.css';

const MAX_PRICES = 500;

type Step = 'prices' | 'generate';
type Gen = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; failure: Failure };

/**
 * Nova proposta em 2 passos: 1) o seu preço por item; 2) gerar o rascunho. Os totais aqui são só PRÉVIA para você
 * conferir: o servidor recalcula tudo ao gerar e a IA nunca inventa preço (docs/09 §6).
 */
export function NewProposal({
  edital,
  existing = [],
}: {
  edital: ProcurementDetail;
  /** Propostas que você já tem para este edital: abrir em vez de duplicar. */
  existing?: Array<{ id: string; total: number; updated_at: string }>;
}) {
  const router = useRouter();
  const { detail, phase, failure, retry } = useCollect(edital);
  const [step, setStep] = useState<Step>('prices');
  const [raw, setRaw] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState('');
  const [gen, setGen] = useState<Gen>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  // Preços digitados e ainda não enviados para gerar: avisa antes de sair.
  useUnsavedGuard(Object.values(raw).some((v) => v.trim() !== '') && gen.kind !== 'loading');

  const items = detail.items.list;
  const priced = items
    .map((it) => ({ it, price: parseBRL(raw[it.number] ?? '') }))
    .filter((x): x is { it: (typeof items)[number]; price: number } => x.price !== null);
  const above = priced.filter(
    (x) => x.it.unit_value != null && x.it.unit_value > 0 && x.price > x.it.unit_value,
  );
  const previewTotal = priced.reduce((sum, x) => sum + x.price * (x.it.quantity ?? 1), 0);
  const overLimit = priced.length > MAX_PRICES;

  async function generate() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setGen({ kind: 'loading' });
    const body: GenerateProposalRequest = {
      procurement_id: detail.id,
      prices: priced
        .slice(0, MAX_PRICES)
        .map((x) => ({ item_number: x.it.number, unit_price: x.price })),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    const r = await callLong<Proposal>(
      '/ai/proposals',
      { method: 'POST', body },
      { signal: ctrl.signal },
    );
    if (abortRef.current !== ctrl) return;
    if (r.ok) router.push(`/propostas/${r.data.id}`);
    else if (r.cancelled) setGen({ kind: 'idle' });
    else setGen({ kind: 'error', failure: r.failure });
  }

  const title = detail.edital_number
    ? `${detail.modality.name} ${detail.edital_number}/${detail.year}`
    : detail.numero_controle_pncp;

  return (
    <div className={s.stack}>
      <section className="wk-panel" aria-label="Edital escolhido">
        <p className="wk-meta">
          {title} · {readableName(detail.organ.name)}
        </p>
        <p style={{ fontWeight: 500, marginTop: 'var(--space-1)' }}>{detail.object}</p>
        <p style={{ marginTop: 'var(--space-2)' }}>
          <Link className="wk-link" href={`/editais/${detail.id}`}>
            Ver o edital
          </Link>
        </p>
      </section>

      {existing.length > 0 ? (
        <Notice>
          Você já tem {existing.length === 1 ? 'uma proposta' : `${existing.length} propostas`} para
          este edital:{' '}
          {existing.map((p, i) => (
            <span key={p.id}>
              {i > 0 ? ' · ' : ''}
              <Link className="wk-link" href={`/propostas/${p.id}`}>
                abrir a de {fmtDateTime(p.updated_at)} ({fmtBRL(p.total)})
              </Link>
            </span>
          ))}
          . Gerar outra cria uma nova, sem apagar as anteriores.
        </Notice>
      ) : null}

      <ol className={s.steps} aria-label="Passos">
        <li className={s.step} data-state={step === 'prices' ? 'active' : 'done'}>
          <span className={s.stepDot}>
            {step === 'prices' ? '1' : <Icon name="check" size={12} />}
          </span>
          Seus preços
        </li>
        <li className={s.step} data-state={step === 'generate' ? 'active' : 'pending'}>
          <span className={s.stepDot}>2</span>
          Gerar rascunho
        </li>
      </ol>

      {phase === 'loading' ? (
        <div className="stateBlock" role="status" aria-live="polite">
          <span className={s.pulse} aria-hidden="true" />
          <div className="stateText">
            <p className="stateTitle">Buscando os itens do edital no PNCP…</p>
          </div>
        </div>
      ) : null}

      {phase === 'error' ? (
        <StateBlock
          kind="error"
          title={failure?.title ?? 'Não foi possível buscar os itens no PNCP.'}
          action={
            <button type="button" className="rg-btn wk-sm" onClick={retry}>
              <Icon name="refresh" size={14} /> Tentar de novo
            </button>
          }
        >
          {failure?.detail ?? 'Isso não quer dizer que o edital não tenha itens.'}
        </StateBlock>
      ) : null}

      {phase === 'idle' && detail.items.collected && items.length === 0 ? (
        <StateBlock
          kind="empty"
          title="O PNCP não trouxe itens para este edital."
          action={
            <button type="button" className="rg-btn wk-sm" onClick={retry}>
              <Icon name="refresh" size={14} /> Tentar coletar de novo
            </button>
          }
        >
          Sem itens não dá para montar a tabela de preços. Alguns órgãos publicam os itens depois:
          tente de novo mais tarde ou confira o edital no PNCP.
        </StateBlock>
      ) : null}

      {phase === 'idle' && items.length > 0 && step === 'prices' ? (
        <>
          <p className={s.note}>
            Informe o <strong>seu preço unitário</strong> em cada item que você vai disputar. Itens
            sem preço ficam como [PREENCHER] na proposta. Os valores abaixo são uma prévia; o
            servidor recalcula ao gerar.
          </p>
          <div className={s.tableWrap}>
            <table className={`wk-table ${s.priceTable}`}>
              <thead>
                <tr>
                  <th className="wk-colnum">Nº</th>
                  <th>Descrição</th>
                  <th className="wk-num">Qtd.</th>
                  <th className="wk-num">Valor de referência do órgão</th>
                  <th className="wk-num">Seu preço unitário</th>
                  <th className="wk-num">Total (prévia)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const price = parseBRL(raw[it.number] ?? '');
                  const ref = it.unit_value != null && it.unit_value > 0 ? it.unit_value : null;
                  const isAbove = price !== null && ref !== null && price > ref;
                  return (
                    <tr key={it.number}>
                      <td className="wk-num">{it.number}</td>
                      <td className={s.desc}>
                        {it.description}
                        {it.unit ? <span className={s.note}> · {it.unit}</span> : null}
                      </td>
                      <td className="wk-num">
                        {it.quantity != null ? fmtQty(it.quantity) : <Dash />}
                      </td>
                      <td className="wk-num">{ref !== null ? fmtBRL(ref) : <Dash />}</td>
                      <td className={`wk-num ${s.priceCell}`}>
                        <label className="wk-sr-only" htmlFor={`price-${it.number}`}>
                          Seu preço unitário do item {it.number}
                        </label>
                        <div className={s.moneyBox}>
                          <span aria-hidden="true">R$</span>
                          <input
                            id={`price-${it.number}`}
                            inputMode="decimal"
                            placeholder="0,00"
                            value={raw[it.number] ?? ''}
                            onChange={(e) => setRaw({ ...raw, [it.number]: e.target.value })}
                            aria-invalid={raw[it.number] ? price === null : undefined}
                          />
                        </div>
                        {raw[it.number] && price === null ? (
                          <span className={`wk-error ${s.cellNote}`}>
                            Use números, ex.: 1.234,56
                          </span>
                        ) : null}
                        {isAbove ? (
                          <span className={s.cellNote}>
                            <span className="rg-tag rg-tag-warning">
                              Acima do valor de referência
                            </span>
                          </span>
                        ) : null}
                      </td>
                      <td className="wk-num">
                        {price !== null && it.quantity != null ? (
                          fmtBRL(price * it.quantity)
                        ) : (
                          <Dash />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={s.bar}>
            <div className={s.barText}>
              <span className={s.note}>
                {priced.length} de {items.length} itens com preço · prévia, o servidor recalcula
              </span>
              <span className={`wk-num ${s.barTotal}`}>{fmtBRL(previewTotal)}</span>
              {above.length > 0 ? (
                <span className={s.note}>
                  {above.length} {above.length === 1 ? 'item acima' : 'itens acima'} do valor de
                  referência: o órgão pode desclassificar.
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className="rg-btn rg-btn-primary"
              disabled={priced.length === 0}
              onClick={() => setStep('generate')}
            >
              Continuar <Icon name="arrowRight" size={14} />
            </button>
          </div>
        </>
      ) : null}

      {phase === 'idle' && items.length > 0 && step === 'generate' ? (
        <section className={s.stack} aria-labelledby="gen-h">
          <h2 id="gen-h" style={{ fontSize: '18px', fontWeight: 500 }}>
            Gerar o rascunho da proposta
          </h2>

          <dl className={s.summary}>
            <div>
              <dt>Itens com preço</dt>
              <dd className="wk-num">
                {Math.min(priced.length, MAX_PRICES)} de {items.length}
              </dd>
            </div>
            <div>
              <dt>Total (prévia)</dt>
              <dd className="wk-num">{fmtBRL(previewTotal)}</dd>
            </div>
          </dl>

          {overLimit ? (
            <Notice>
              São aceitos até {MAX_PRICES} preços por proposta. Os {priced.length - MAX_PRICES}{' '}
              últimos ficarão como [PREENCHER].
            </Notice>
          ) : null}

          <Notice>
            Dados da sua empresa entram como [PREENCHER] no rascunho; complete no Word.
          </Notice>

          <div className="wk-field">
            <label htmlFor="prop-notes">Observações para a IA (opcional)</label>
            <textarea
              id="prop-notes"
              rows={3}
              maxLength={1000}
              value={notes}
              disabled={gen.kind === 'loading'}
              placeholder="Ex.: prazo de entrega em 15 dias; garantia de 12 meses."
              onChange={(e) => setNotes(e.target.value)}
            />
            <span className="wk-help">
              A IA só escreve com base no edital e nos seus preços. O que ela não souber fica como
              [PREENCHER].
            </span>
          </div>

          {gen.kind === 'loading' ? (
            <div className={s.progress} aria-busy="true">
              <div className={s.progressHead}>
                <p style={{ display: 'flex', alignItems: 'center', fontWeight: 500 }}>
                  <span className={s.pulse} aria-hidden="true" />
                  Escrevendo o rascunho…
                </p>
                <button
                  type="button"
                  className="rg-btn wk-sm"
                  onClick={() => abortRef.current?.abort()}
                >
                  Cancelar
                </button>
              </div>
              <p className="wk-sr-only" role="status" aria-live="polite">
                Gerando a proposta. Isso leva de 20 a 90 segundos.
              </p>
              <p className={s.note}>Leva de 20 a 90 segundos. O servidor responde só no final.</p>
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
              onClick={() => setStep('prices')}
              disabled={gen.kind === 'loading'}
            >
              <Icon name="arrowLeft" size={14} /> Voltar aos preços
            </button>
            <button
              type="button"
              className="rg-btn rg-btn-primary"
              onClick={generate}
              disabled={gen.kind === 'loading'}
            >
              <Icon name="sparkle" size={14} />{' '}
              {gen.kind === 'loading' ? 'Gerando…' : 'Gerar rascunho'}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
