'use client';

import type { LegalPiece } from '@agora/contracts';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import { callLong } from '@/lib/call';
import type { Failure } from '@/lib/failure';
import { fmtDateTime, safeHref } from '@/lib/format';
import { countPlaceholders, KIND_LABEL, tokenize } from '@/lib/legal';
import { Icon } from '../Icon';
import { AiSeal, Notice, StateBlock } from '../ui';
import s from './recursos.module.css';

type Key = LegalPiece['sections'][number]['key'];

/** Texto com [S1] como chip que leva à fonte e [PREENCHER: …] destacado. */
function Body({ text, sourceIds }: { text: string; sourceIds: Set<string> }) {
  return (
    <p className={s.body}>
      {tokenize(text).map((t, i) => {
        const k = `${t.type}-${i}`;
        if (t.type === 'text') return <Fragment key={k}>{t.text}</Fragment>;
        if (t.type === 'placeholder') {
          return (
            <mark className={s.ph} key={k}>
              {t.text}
            </mark>
          );
        }
        const known = sourceIds.has(t.id);
        return known ? (
          <a className={s.chip} href={`#src-${t.id}`} key={k} aria-label={`Fonte ${t.id}`}>
            {t.id}
          </a>
        ) : (
          <span
            className={`${s.chip} ${s.chipMissing}`}
            key={k}
            title="Esta fonte não está na lista: não confie nesta frase sem conferir."
          >
            {t.id}?
          </span>
        );
      })}
    </p>
  );
}

/**
 * Peça (impugnação, recurso ou contrarrazões). O prazo e as fontes vêm do servidor; aqui só se edita o TEXTO.
 * Salvar exige a versão atual (If-Match); em conflito recarrega e guarda o que a pessoa escreveu.
 */
export function LegalPieceView({ initial }: { initial: LegalPiece }) {
  const [piece, setPiece] = useState(initial);
  const [bodies, setBodies] = useState<Record<Key, string>>(
    () => Object.fromEntries(initial.sections.map((x) => [x.key, x.body])) as Record<Key, string>,
  );
  const [editing, setEditing] = useState<Key | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [lostDraft, setLostDraft] = useState<Record<string, string> | null>(null);

  const sourceIds = new Set(piece.sources.map((x) => x.id));
  const dirty = piece.sections.some((x) => bodies[x.key] !== x.body);
  const pending = piece.sections.reduce((n, x) => n + countPlaceholders(bodies[x.key] ?? ''), 0);
  const unverified = piece.sources.filter((x) => x.quote && !x.quote_verified).length;

  const toBodies = (p: LegalPiece) =>
    Object.fromEntries(p.sections.map((x) => [x.key, x.body])) as Record<Key, string>;

  async function save() {
    setSaving(true);
    setFailure(null);
    setSavedAt(null);
    const r = await callLong<LegalPiece>(
      `/legal-pieces/${piece.id}`,
      {
        method: 'PATCH',
        headers: { 'If-Match': String(piece.version) },
        body: { sections: piece.sections.map((x) => ({ key: x.key, body: bodies[x.key] ?? '' })) },
      },
      { timeoutMs: 20_000 },
    );
    if (r.ok) {
      setPiece(r.data);
      setBodies(toBodies(r.data));
      setEditing(null);
      setSavedAt(r.data.updated_at);
      setSaving(false);
      return;
    }
    if (r.raw?.problem?.code === 'version_conflict') {
      const mine = { ...bodies };
      const fresh = await callLong<LegalPiece>(
        `/legal-pieces/${piece.id}`,
        {},
        { timeoutMs: 20_000 },
      );
      if (fresh.ok) {
        setLostDraft(mine);
        setPiece(fresh.data);
        setBodies(toBodies(fresh.data));
        setEditing(null);
      }
    }
    setFailure(r.failure);
    setSaving(false);
  }

  return (
    <div className={s.layout}>
      <div className={s.main}>
        <div className={s.sealBar} role="note">
          <AiSeal>Rascunho gerado por IA</AiSeal>
          Não substitui assessoria jurídica; as fontes vêm de pesquisa na web e precisam ser
          conferidas.
        </div>

        <div className={s.editorHead}>
          <span className="rg-tag rg-tag-neutral">{KIND_LABEL[piece.kind]}</span>
          {pending > 0 ? (
            <span className="rg-tag rg-tag-warning">
              {pending} {pending === 1 ? 'pendência' : 'pendências'} [PREENCHER]
            </span>
          ) : (
            <span className="rg-tag rg-tag-success">Sem pendências</span>
          )}
          <span className={s.note}>
            Atualizada em {fmtDateTime(piece.updated_at)} · versão {piece.version} · modelo{' '}
            {piece.meta.model}
          </span>
        </div>

        {piece.sections.map((sec) => {
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
                    maxLength={30000}
                    onChange={(e) => setBodies({ ...bodies, [sec.key]: e.target.value })}
                  />
                  <span className="wk-help">
                    Mantenha os marcadores [S1], [S2] onde citar uma fonte. Troque cada [PREENCHER:
                    …] pelo dado verdadeiro.
                  </span>
                </>
              ) : (
                <Body text={body} sourceIds={sourceIds} />
              )}
            </section>
          );
        })}

        {failure ? (
          <StateBlock kind="error" title={failure.title}>
            {failure.detail}
          </StateBlock>
        ) : null}

        {lostDraft ? (
          <details className={s.conflict}>
            <summary>Seu texto antes do conflito (não foi salvo)</summary>
            {piece.sections.map((x) =>
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
            <a className="rg-btn" href={`/api/legal-pieces/${piece.id}/export.docx`} download>
              <Icon name="doc" size={14} /> Baixar DOCX
            </a>
          )}
          <span className="wk-saved" role="status" aria-live="polite">
            {savedAt ? 'Alterações salvas' : dirty ? 'Há alterações não salvas' : ''}
          </span>
          <Link className="wk-link" href={`/editais/${piece.procurement_id}`}>
            Ver o edital
          </Link>
        </div>
        <p className={s.disclaimer}>{piece.disclaimer}</p>
      </div>

      <aside className={s.aside} aria-label="Prazo, fontes e avisos">
        <section className={s.box} aria-labelledby="box-prazo">
          <h2 id="box-prazo">Prazo</h2>
          <p className={s.deadline}>{piece.deadline.label}</p>
          <p className={s.note}>{piece.deadline.basis}</p>
          <div>
            <span className="rg-tag rg-tag-warning">Validar com o jurídico</span>
          </div>
        </section>

        <section className={s.box} aria-labelledby="box-fontes">
          <h2 id="box-fontes">Fontes ({piece.sources.length})</h2>
          {piece.meta.web_search !== 'ok' ? (
            <Notice>
              {piece.meta.web_search === 'failed'
                ? 'A pesquisa na web falhou: a minuta saiu sem fontes. Não use afirmações jurídicas sem conferir.'
                : 'A pesquisa na web não está configurada: a minuta saiu sem fontes.'}
            </Notice>
          ) : null}
          {piece.sources.length === 0 ? (
            <p className={s.note}>Nenhuma fonte foi usada nesta minuta.</p>
          ) : (
            <ul className={s.sources}>
              {piece.sources.map((src) => {
                const href = safeHref(src.url);
                return (
                  <li className={s.source} id={`src-${src.id}`} key={src.id}>
                    <p className={s.sourceHead}>
                      <span className={s.sourceId}>{src.id}</span>
                      {href ? (
                        <a
                          className="wk-link"
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {src.title}
                        </a>
                      ) : (
                        <span>{src.title}</span>
                      )}
                    </p>
                    <p className={s.note}>{src.host}</p>
                    {src.quote ? (
                      <>
                        <blockquote className={s.quote}>“{src.quote}”</blockquote>
                        {src.quote_verified ? (
                          <span className="rg-tag rg-tag-success">Trecho conferido na fonte</span>
                        ) : (
                          <span className="rg-tag rg-tag-warning">
                            Trecho não conferido na fonte
                          </span>
                        )}
                      </>
                    ) : (
                      <p className={s.note}>Sem trecho citado: abra a fonte e confira.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {unverified > 0 ? (
            <p className={s.note}>
              {unverified}{' '}
              {unverified === 1 ? 'trecho não foi encontrado' : 'trechos não foram encontrados'} no
              texto da fonte. Não trate como citação literal.
            </p>
          ) : null}
        </section>

        {piece.warnings.length > 0 ? (
          <section className={s.box} aria-labelledby="box-avisos">
            <h2 id="box-avisos">Avisos</h2>
            <div className={s.warns}>
              {piece.warnings.map((w) => (
                <Notice key={w}>{w}</Notice>
              ))}
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  );
}
