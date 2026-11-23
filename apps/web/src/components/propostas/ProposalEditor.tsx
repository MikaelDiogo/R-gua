'use client';

import type { Proposal } from '@agora/contracts';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import { callLong } from '@/lib/call';
import type { Failure } from '@/lib/failure';
import { fmtBRL, fmtDateTime, fmtQty } from '@/lib/format';
import { useUnsavedGuard } from '@/lib/unsaved';
import { Icon } from '../Icon';
import { AiSeal, Dash, StateBlock } from '../ui';
import s from './propostas.module.css';

type Key = Proposal['sections'][number]['key'];

const PLACEHOLDER = /\[PREENCHER:[^\]]*\]/g;

/** Texto com os marcadores [PREENCHER: …] destacados: o que a IA não tinha como saber precisa aparecer. */
function WithPlaceholders({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(PLACEHOLDER)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(<Fragment key={`t${n}`}>{text.slice(last, at)}</Fragment>);
    parts.push(
      <mark className={s.ph} key={`p${n}`}>
        {m[0]}
      </mark>,
    );
    last = at + m[0].length;
    n++;
  }
  if (last < text.length) parts.push(<Fragment key="end">{text.slice(last)}</Fragment>);
  return <p className={s.body}>{parts.length > 0 ? parts : text}</p>;
}

const countPlaceholders = (text: string) => (text.match(PLACEHOLDER) ?? []).length;

/**
 * Rascunho da proposta. Os totais e a tabela de itens vêm somados do servidor; aqui só se edita o TEXTO.
 * Salvar exige a versão atual (If-Match): se outra pessoa mexeu, recarrega e não perde o que você escreveu.
 */
export function ProposalEditor({ initial }: { initial: Proposal }) {
  const [proposal, setProposal] = useState(initial);
  const [bodies, setBodies] = useState<Record<Key, string>>(
    () => Object.fromEntries(initial.sections.map((x) => [x.key, x.body])) as Record<Key, string>,
  );
  const [editing, setEditing] = useState<Key | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [lostDraft, setLostDraft] = useState<Record<string, string> | null>(null);

  const dirty = proposal.sections.some((x) => bodies[x.key] !== x.body);
  useUnsavedGuard(dirty);
  const pending = proposal.sections.reduce((n, x) => n + countPlaceholders(bodies[x.key] ?? ''), 0);

  async function save() {
    setSaving(true);
    setFailure(null);
    setSavedAt(null);
    const r = await callLong<Proposal>(
      `/proposals/${proposal.id}`,
      {
        method: 'PATCH',
        headers: { 'If-Match': String(proposal.version) },
        body: {
          sections: proposal.sections.map((x) => ({ key: x.key, body: bodies[x.key] ?? '' })),
        },
      },
      { timeoutMs: 20_000 },
    );
    if (r.ok) {
      setProposal(r.data);
      setBodies(
        Object.fromEntries(r.data.sections.map((x) => [x.key, x.body])) as Record<Key, string>,
      );
      setEditing(null);
      setSavedAt(r.data.updated_at);
      setSaving(false);
      return;
    }
    if (r.raw?.problem?.code === 'version_conflict') {
      // Guarda o que a pessoa escreveu e recarrega a versão do servidor.
      const mine = { ...bodies };
      const fresh = await callLong<Proposal>(
        `/proposals/${proposal.id}`,
        {},
        { timeoutMs: 20_000 },
      );
      if (fresh.ok) {
        setLostDraft(mine);
        setProposal(fresh.data);
        setBodies(
          Object.fromEntries(fresh.data.sections.map((x) => [x.key, x.body])) as Record<
            Key,
            string
          >,
        );
        setEditing(null);
      }
    }
    setFailure(r.failure);
    setSaving(false);
  }

  return (
    <div className={s.stack}>
      <div className={s.sealBar} role="note">
        <AiSeal>Rascunho gerado por IA</AiSeal>
        Revisar antes de enviar. Confira preços, datas e declarações com o edital.
      </div>

      {proposal.warnings.length > 0 ? (
        <section className={s.warnBox} aria-labelledby="warn-h">
          <h2 id="warn-h">
            <Icon name="alert" size={16} /> Antes de enviar: {proposal.warnings.length}{' '}
            {proposal.warnings.length === 1 ? 'ponto de atenção' : 'pontos de atenção'}
          </h2>
          <ul>
            {proposal.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className={s.editorHead}>
        {pending > 0 ? (
          <span className="rg-tag rg-tag-warning">
            {pending} {pending === 1 ? 'pendência' : 'pendências'} [PREENCHER]
          </span>
        ) : (
          <span className="rg-tag rg-tag-success">Sem pendências</span>
        )}
        <span className={s.note}>
          Atualizada em {fmtDateTime(proposal.updated_at)} · versão {proposal.version} · modelo{' '}
          {proposal.meta.model}
        </span>
      </div>

      {proposal.sections.map((sec) => {
        const isEditing = editing === sec.key;
        const body = bodies[sec.key] ?? '';
        const n = countPlaceholders(body);
        return (
          <section className={s.section} key={sec.key} aria-labelledby={`sec-${sec.key}`}>
            <div className={s.sectionHead}>
              <h2 id={`sec-${sec.key}`}>{sec.title}</h2>
              <div className={s.actions}>
                {n > 0 ? <span className="rg-tag rg-tag-warning">{n} a preencher</span> : null}
                <button
                  type="button"
                  className="rg-btn wk-sm"
                  onClick={() => setEditing(isEditing ? null : sec.key)}
                >
                  {isEditing ? 'Concluir edição' : 'Editar'}
                </button>
              </div>
            </div>
            {isEditing ? (
              <>
                <label className="wk-sr-only" htmlFor={`area-${sec.key}`}>
                  Texto de {sec.title}
                </label>
                <textarea
                  id={`area-${sec.key}`}
                  className={s.area}
                  value={body}
                  maxLength={20000}
                  onChange={(e) => setBodies({ ...bodies, [sec.key]: e.target.value })}
                />
                <span className="wk-help">
                  Troque cada [PREENCHER: …] pelo dado verdadeiro. Não deixe marcadores na proposta
                  enviada.
                </span>
              </>
            ) : (
              <WithPlaceholders text={body} />
            )}
          </section>
        );
      })}

      <section className={s.section} aria-labelledby="sec-itens">
        <div className={s.sectionHead}>
          <h2 id="sec-itens">Itens e preços</h2>
          <span className={s.note}>Somados pelo servidor</span>
        </div>
        <div className={s.tableWrap}>
          <table className={`wk-table ${s.priceTable}`}>
            <thead>
              <tr>
                <th className="wk-colnum">Nº</th>
                <th>Descrição</th>
                <th className="wk-num">Qtd.</th>
                <th>Un.</th>
                <th className="wk-num">Preço unitário</th>
                <th className="wk-num">Referência do órgão</th>
                <th className="wk-num">Total</th>
              </tr>
            </thead>
            <tbody>
              {proposal.items.map((it) => (
                <tr key={it.number}>
                  <td className="wk-num">{it.number}</td>
                  <td className={s.desc}>{it.description}</td>
                  <td className="wk-num">{it.quantity != null ? fmtQty(it.quantity) : <Dash />}</td>
                  <td>{it.unit ?? <Dash />}</td>
                  <td className="wk-num">
                    {it.unit_price != null ? (
                      fmtBRL(it.unit_price)
                    ) : (
                      <mark className={s.ph}>[PREENCHER]</mark>
                    )}
                    {it.above_reference ? (
                      <span className={s.cellNote}>
                        <span className="rg-tag rg-tag-warning">Acima da referência</span>
                      </span>
                    ) : null}
                  </td>
                  <td className="wk-num">
                    {it.reference_unit_value != null && it.reference_unit_value > 0 ? (
                      fmtBRL(it.reference_unit_value)
                    ) : (
                      <Dash />
                    )}
                  </td>
                  <td className="wk-num">{it.total != null ? fmtBRL(it.total) : <Dash />}</td>
                </tr>
              ))}
              <tr className={s.totalRow}>
                <td colSpan={6}>Total da proposta</td>
                <td className="wk-num">{fmtBRL(proposal.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {failure ? (
        <StateBlock kind="error" title={failure.title}>
          {failure.detail}
        </StateBlock>
      ) : null}

      {lostDraft ? (
        <details className={s.conflict}>
          <summary>Seu texto antes do conflito (não foi salvo)</summary>
          {proposal.sections.map((x) =>
            lostDraft[x.key] && lostDraft[x.key] !== x.body ? (
              <div key={x.key}>
                <p className={s.note}>{x.title}</p>
                <pre>{lostDraft[x.key]}</pre>
              </div>
            ) : null,
          )}
        </details>
      ) : null}

      <div className={s.actions}>
        <button
          type="button"
          className="rg-btn rg-btn-primary"
          onClick={save}
          disabled={!dirty || saving}
        >
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
        {dirty ? (
          <button type="button" className="rg-btn" disabled>
            <Icon name="doc" size={14} /> Salve para baixar
          </button>
        ) : (
          <a className="rg-btn" href={`/api/proposals/${proposal.id}/export.docx`} download>
            <Icon name="doc" size={14} /> Baixar DOCX
          </a>
        )}
        <span className="wk-saved" role="status" aria-live="polite">
          {savedAt ? 'Alterações salvas' : dirty ? 'Há alterações não salvas' : ''}
        </span>
        <Link className="wk-link" href={`/editais/${proposal.procurement_id}`}>
          Ver o edital
        </Link>
      </div>
      {pending > 0 && !dirty ? (
        <p className={s.note}>
          O DOCX sai com {pending} {pending === 1 ? 'pendência' : 'pendências'} [PREENCHER].
          Preencha antes de enviar ao órgão.
        </p>
      ) : null}
      <p className={s.note}>{proposal.disclaimer}</p>
    </div>
  );
}
