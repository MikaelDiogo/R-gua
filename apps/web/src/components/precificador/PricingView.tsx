'use client';

import type { PricingBenchmarkResponse, ProcurementDetail } from '@agora/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { callLong } from '@/lib/call';
import type { Failure } from '@/lib/failure';
import { fmtBRL, fmtInt, fmtQty, readableName } from '@/lib/format';
import { Icon } from '../Icon';
import { Dash, Notice, SkeletonRows, StateBlock } from '../ui';
import { MarginSimulator, type Prefill } from './MarginSimulator';
import s from './precificador.module.css';

type Item = PricingBenchmarkResponse['items'][number];
type Phase =
  | { kind: 'loading'; step: string }
  | { kind: 'done'; data: PricingBenchmarkResponse }
  | { kind: 'error'; failure: Failure };

const CONF: Record<
  Item['confidence'],
  { label: string; tone: 'neutral' | 'warning' | 'accent' | 'success' }
> = {
  none: { label: 'Sem amostra', tone: 'neutral' },
  low: { label: 'Baixa', tone: 'warning' },
  medium: { label: 'Média', tone: 'accent' },
  high: { label: 'Alta', tone: 'success' },
};

const money = (n: number | null) => (n == null ? <Dash /> : fmtBRL(n));

/**
 * Benchmark por item: o servidor compara com itens de outras contratações da base e devolve mediana, quartis,
 * quantidade de amostras e a CONFIANÇA em palavras. Quando a amostra é pequena a tela diz, não finge precisão.
 */
export function PricingView({ edital }: { edital: ProcurementDetail }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading', step: 'Buscando o benchmark…' });
  const [prefill, setPrefill] = useState<Prefill | undefined>();
  const [shown, setShown] = useState(50);
  const started = useRef(false);

  const load = useCallback(async () => {
    setPhase({ kind: 'loading', step: 'Buscando o benchmark…' });
    const url = `/pricing/benchmark?procurement_id=${encodeURIComponent(edital.id)}`;
    let r = await callLong<PricingBenchmarkResponse>(url, {}, { timeoutMs: 30_000 });
    if (r.ok && !r.data.collected_items) {
      // Itens do edital ainda não vieram do PNCP: coleta e pergunta de novo, uma vez.
      setPhase({ kind: 'loading', step: 'Buscando os itens do edital no PNCP…' });
      const c = await callLong<ProcurementDetail>(
        `/procurements/${encodeURIComponent(edital.id)}/collect`,
        { method: 'POST' },
        { timeoutMs: 40_000 },
      );
      if (!c.ok) return setPhase({ kind: 'error', failure: c.failure });
      r = await callLong<PricingBenchmarkResponse>(url, {}, { timeoutMs: 30_000 });
    }
    setPhase(r.ok ? { kind: 'done', data: r.data } : { kind: 'error', failure: r.failure });
  }, [edital.id]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: roda só na montagem
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void load();
  }, []);

  const title = edital.edital_number
    ? `${edital.modality.name} ${edital.edital_number}/${edital.year}`
    : edital.numero_controle_pncp;

  return (
    <div className={s.stack}>
      <section className="wk-panel" aria-label="Edital escolhido">
        <p className="wk-meta">
          {title} · {readableName(edital.organ.name)}
        </p>
        <p style={{ fontWeight: 500, marginTop: 'var(--space-1)' }}>{edital.object}</p>
        <p
          style={{
            marginTop: 'var(--space-3)',
            display: 'flex',
            gap: 'var(--space-4)',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Link
            className="rg-btn rg-btn-primary wk-sm"
            href={`/propostas/nova?edital=${edital.id}`}
          >
            <Icon name="sparkle" size={14} /> Usar no preço da proposta
          </Link>
          <Link className="wk-link" href={`/editais/${edital.id}`}>
            Ver o edital
          </Link>
          <Link className="wk-link" href="/precificador">
            Escolher outro edital
          </Link>
        </p>
      </section>

      {phase.kind === 'loading' ? <SkeletonRows rows={4} label={phase.step} /> : null}

      {phase.kind === 'error' ? (
        <StateBlock
          kind="error"
          title={phase.failure.title}
          action={
            phase.failure.retryable ? (
              <button type="button" className="rg-btn wk-sm" onClick={load}>
                <Icon name="refresh" size={14} /> Tentar de novo
              </button>
            ) : undefined
          }
        >
          {phase.failure.detail}
        </StateBlock>
      ) : null}

      {phase.kind === 'done' ? (
        phase.data.items.length === 0 ? (
          <StateBlock kind="empty" title="Este edital não tem itens para comparar.">
            O PNCP não trouxe itens, então não há o que precificar aqui. Use o simulador abaixo.
          </StateBlock>
        ) : (
          <>
            {phase.data.items.some((i) => i.confidence === 'none' || i.confidence === 'low') ? (
              <Notice>
                A base de comparação ainda é pequena ({fmtInt(phase.data.base_items)} itens de
                outras contratações). Onde a confiança for baixa ou não houver amostra, use o número
                só como pista, não como preço final.
              </Notice>
            ) : (
              <p className={s.base}>
                Comparado com {fmtInt(phase.data.base_items)} itens de outras contratações da base.
              </p>
            )}
            <p className={s.base}>
              Todos os valores são em reais (R$) por unidade de medida do item. Mediana e quartis
              vêm de itens parecidos, com a mesma unidade, de outras contratações.
            </p>
            <div className={s.tableWrap}>
              <table className={`wk-table ${s.table}`}>
                <thead>
                  <tr>
                    <th className="wk-colnum">Nº</th>
                    <th>Item</th>
                    <th className="wk-num">Valor no edital (R$/un.)</th>
                    <th className="wk-num">Amostras</th>
                    <th className="wk-num">Mediana (R$/un.)</th>
                    <th className="wk-num">1º a 3º quartil</th>
                    <th className="wk-num">Mín. a máx.</th>
                    <th>Confiança</th>
                    <th>
                      <span className="wk-sr-only">Ação</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {phase.data.items.slice(0, shown).map((it) => {
                    const c = it.comparables;
                    const conf = CONF[it.confidence];
                    return (
                      <tr key={it.item_number}>
                        <td className="wk-num">{it.item_number}</td>
                        <td className={s.desc}>
                          {it.description}
                          {it.quantity != null ? (
                            <span className={s.notes}>
                              {fmtQty(it.quantity)} {it.unit ?? ''}
                            </span>
                          ) : null}
                          {it.notes.map((n) => (
                            <span className={s.notes} key={n}>
                              {n}
                            </span>
                          ))}
                          {c.outliers_removed > 0 ? (
                            <span className={s.notes}>
                              {c.outliers_removed}{' '}
                              {c.outliers_removed === 1
                                ? 'valor fora da curva foi'
                                : 'valores fora da curva foram'}{' '}
                              descartados.
                            </span>
                          ) : null}
                        </td>
                        <td className="wk-num">
                          {money(
                            it.edital_unit_value && it.edital_unit_value > 0
                              ? it.edital_unit_value
                              : null,
                          )}
                        </td>
                        <td className="wk-num">{fmtInt(c.n)}</td>
                        <td className="wk-num">{money(c.median)}</td>
                        <td className={`wk-num ${s.range}`}>
                          {c.q1 == null || c.q3 == null ? (
                            <Dash />
                          ) : (
                            `${fmtBRL(c.q1)} a ${fmtBRL(c.q3)}`
                          )}
                        </td>
                        <td className={`wk-num ${s.range}`}>
                          {c.min == null || c.max == null ? (
                            <Dash />
                          ) : (
                            `${fmtBRL(c.min)} a ${fmtBRL(c.max)}`
                          )}
                        </td>
                        <td>
                          <span className={`rg-tag rg-tag-${conf.tone}`}>{conf.label}</span>
                        </td>
                        <td className={s.simulate}>
                          <button
                            type="button"
                            className="rg-btn wk-sm"
                            onClick={() => {
                              setPrefill({
                                key: Date.now(),
                                reference:
                                  it.edital_unit_value && it.edital_unit_value > 0
                                    ? it.edital_unit_value
                                    : null,
                                quantity: it.quantity,
                              });
                              document.getElementById('sim-h')?.scrollIntoView({ block: 'center' });
                            }}
                          >
                            Simular
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {shown < phase.data.items.length ? (
              <div>
                <button
                  type="button"
                  className="rg-btn wk-sm"
                  onClick={() => setShown((n) => n + 50)}
                >
                  Mostrar mais itens
                </button>
              </div>
            ) : null}
          </>
        )
      ) : null}

      <MarginSimulator prefill={prefill} />
    </div>
  );
}
