'use client';

import type { PricingSimulationRequest, PricingSimulationResponse } from '@agora/contracts';
import { useEffect, useState } from 'react';
import { callLong } from '@/lib/call';
import type { Failure } from '@/lib/failure';
import { fmtBRL } from '@/lib/format';
import { parseBRL, toInputBRL } from '@/lib/money';
import { Icon } from '../Icon';
import { StateBlock } from '../ui';
import s from './precificador.module.css';

export type Prefill = { key: number; reference: number | null; quantity: number | null };

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; data: PricingSimulationResponse }
  | { kind: 'error'; failure: Failure };

/**
 * Simulador de margem. Você informa custo, impostos e margem; o SERVIDOR calcula preço-alvo, preço mínimo e
 * cenários (docs/04 §5). A tela não faz a conta: só desenha o que voltou.
 */
export function MarginSimulator({ prefill }: { prefill?: Prefill }) {
  const [cost, setCost] = useState('');
  const [taxes, setTaxes] = useState('');
  const [margin, setMargin] = useState('');
  const [qty, setQty] = useState('1');
  const [ref, setRef] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [hint, setHint] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reage só a um novo pedido de preenchimento
  useEffect(() => {
    if (!prefill) return;
    if (prefill.reference != null) setRef(toInputBRL(prefill.reference));
    if (prefill.quantity != null) setQty(String(prefill.quantity).replace('.', ','));
    setPhase({ kind: 'idle' });
  }, [prefill?.key]);

  async function calc(e: React.FormEvent) {
    e.preventDefault();
    const c = parseBRL(cost);
    const t = taxes.trim() === '' ? 0 : parseBRL(taxes);
    const m = parseBRL(margin);
    const q = qty.trim() === '' ? 1 : parseBRL(qty);
    const r = ref.trim() === '' ? undefined : (parseBRL(ref) ?? null);
    if (c === null || c <= 0) return setHint('Informe o custo unitário (maior que zero).');
    if (t === null || t < 0 || t > 100)
      return setHint('Impostos: use um percentual entre 0 e 100.');
    if (m === null || m < 0) return setHint('Informe a margem desejada em percentual.');
    if (q === null || q <= 0) return setHint('A quantidade precisa ser maior que zero.');
    if (r === null) return setHint('O valor de referência não é um número válido.');
    // Pré-condição do cálculo (não é a conta): o servidor repete esta checagem e é quem decide.
    if (t + m >= 100) {
      return setHint(
        'Impostos e margem somam 100% ou mais: não existe preço que entregue isso. Reduza um dos dois.',
      );
    }
    setHint(null);
    setPhase({ kind: 'loading' });
    const body: PricingSimulationRequest = {
      cost: c,
      taxes_pct: t,
      margin_pct: m,
      quantity: q,
      ...(r !== undefined && r > 0 ? { reference_unit_value: r } : {}),
    };
    const res = await callLong<PricingSimulationResponse>(
      '/pricing/simulations',
      { method: 'POST', body },
      { timeoutMs: 20_000 },
    );
    if (res.ok) return setPhase({ kind: 'done', data: res.data });
    // Recusa de validação: a mensagem do servidor vem no título do problema e diz exatamente o que corrigir.
    const p = res.raw?.problem;
    if (p?.code === 'validation_failed' && p.title) {
      setHint([p.title, p.detail].filter(Boolean).join(' '));
      return setPhase({ kind: 'idle' });
    }
    setPhase({ kind: 'error', failure: res.failure });
  }

  return (
    <section className="wk-panel" aria-labelledby="sim-h">
      <h2 id="sim-h" style={{ fontSize: '18px', fontWeight: 500, marginBottom: 'var(--space-4)' }}>
        Simulador de margem
      </h2>
      <div className={s.sim}>
        <form className={s.simForm} onSubmit={calc} noValidate>
          <div className="wk-field">
            <label htmlFor="sim-cost">Custo por unidade (R$)</label>
            <div className="wk-money">
              <span aria-hidden="true">R$</span>
              <input
                id="sim-cost"
                inputMode="decimal"
                value={cost}
                placeholder="0,00"
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
          </div>
          <div className={s.pair}>
            <div className="wk-field">
              <label htmlFor="sim-tax">Impostos (%)</label>
              <input
                id="sim-tax"
                inputMode="decimal"
                value={taxes}
                placeholder="0"
                onChange={(e) => setTaxes(e.target.value)}
              />
            </div>
            <div className="wk-field">
              <label htmlFor="sim-margin">Margem sobre o preço (%)</label>
              <input
                id="sim-margin"
                inputMode="decimal"
                value={margin}
                placeholder="15"
                onChange={(e) => setMargin(e.target.value)}
              />
            </div>
          </div>
          <div className={s.pair}>
            <div className="wk-field">
              <label htmlFor="sim-qty">Quantidade</label>
              <input
                id="sim-qty"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div className="wk-field">
              <label htmlFor="sim-ref">Referência por unidade (opcional)</label>
              <div className="wk-money">
                <span aria-hidden="true">R$</span>
                <input
                  id="sim-ref"
                  inputMode="decimal"
                  value={ref}
                  placeholder="0,00"
                  onChange={(e) => setRef(e.target.value)}
                />
              </div>
            </div>
          </div>
          {hint ? (
            <span className="wk-error" role="alert">
              {hint}
            </span>
          ) : null}
          <div>
            <button
              type="submit"
              className="rg-btn rg-btn-primary"
              disabled={phase.kind === 'loading'}
            >
              {phase.kind === 'loading' ? 'Calculando…' : 'Calcular'}
            </button>
          </div>
        </form>

        <div aria-live="polite">
          {phase.kind === 'idle' ? (
            <div className={s.placeholder}>
              Preencha o custo e a margem e clique em Calcular. O servidor devolve o preço-alvo e o
              preço mínimo.
            </div>
          ) : null}
          {phase.kind === 'loading' ? (
            <div className={s.placeholder} role="status">
              Calculando…
            </div>
          ) : null}
          {phase.kind === 'error' ? (
            <StateBlock kind="error" title={phase.failure.title}>
              {phase.failure.detail}
            </StateBlock>
          ) : null}
          {phase.kind === 'done' ? <Result data={phase.data} /> : null}
        </div>
      </div>
    </section>
  );
}

/** Valor negativo vira texto de erro com a palavra "prejuízo": a cor nunca fala sozinha. */
function Money({ v }: { v: number }) {
  return v < 0 ? <span className="wk-error">{fmtBRL(v)} · prejuízo</span> : fmtBRL(v);
}

function Result({ data }: { data: PricingSimulationResponse }) {
  return (
    <div className={s.result}>
      <div className={s.hero}>
        <span className={s.heroLabel}>Preço-alvo por unidade</span>
        <span className={`wk-num ${s.heroValue}`}>{fmtBRL(data.target_price)}</span>
        {data.within_reference === true ? (
          <span>
            <span className="rg-tag rg-tag-success">Cabe no valor de referência</span>
          </span>
        ) : null}
        {data.within_reference === false ? (
          <span>
            <span className="rg-tag rg-tag-warning">Acima do valor de referência</span>
          </span>
        ) : null}
      </div>
      <dl className={s.facts}>
        <div>
          <dt>Preço mínimo (sem prejuízo)</dt>
          <dd className="wk-num">{fmtBRL(data.break_even_price)}</dd>
        </div>
        <div>
          <dt>Total no preço-alvo</dt>
          <dd className="wk-num">{fmtBRL(data.total_at_target)}</dd>
        </div>
        <div>
          <dt>Lucro no preço-alvo</dt>
          <dd className="wk-num">
            <Money v={data.profit_at_target} />
          </dd>
        </div>
      </dl>
      {data.scenarios.length > 0 ? (
        <div className={s.scenarios}>
          <table className="wk-table">
            <caption className="wk-sr-only">Cenários de lance</caption>
            <thead>
              <tr>
                <th>Cenário</th>
                <th className="wk-num">Margem</th>
                <th className="wk-num">Preço unitário</th>
                <th className="wk-num">Lucro</th>
              </tr>
            </thead>
            <tbody>
              {data.scenarios.map((c) => (
                <tr key={c.label}>
                  <td>{c.label}</td>
                  <td className="wk-num">
                    {c.margin_pct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
                  </td>
                  <td className="wk-num">{fmtBRL(c.unit_price)}</td>
                  <td className="wk-num">
                    <Money v={c.profit} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className={s.base}>
        <Icon name="info" size={12} /> Cálculo feito pelo servidor. Confira impostos e custos reais
        antes de dar o lance.
      </p>
    </div>
  );
}
