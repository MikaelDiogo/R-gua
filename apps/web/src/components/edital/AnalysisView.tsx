'use client';

import type { AnalysisResponse, Citation } from '@agora/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtDateTime } from '@/lib/format';
import { Citations, citeKey, ReaderContext } from './Citations';
import s from './edital.module.css';

type Analysis = NonNullable<AnalysisResponse['analysis']>;
type Req = Analysis['eligibility'][number];

const LEVEL: Record<'low' | 'medium' | 'high', { label: string; tag: string }> = {
  low: { label: 'Risco baixo', tag: 'rg-tag rg-tag-success' },
  medium: { label: 'Risco médio', tag: 'rg-tag rg-tag-warning' },
  high: { label: 'Risco alto', tag: 'rg-tag rg-tag-error' },
};

/** A IA devolve a data como texto; se for uma data válida mostra no padrão do app, senão o texto como veio. */
function showDate(at: string | null): string {
  if (!at) return 'não consta';
  const t = Date.parse(at);
  return Number.isNaN(t) ? at : fmtDateTime(new Date(t).toISOString());
}

function Reqs({ items }: { items: Req[] }) {
  if (items.length === 0) return <p className={s.empty}>Nenhum item identificado nesta seção.</p>;
  return (
    <ul className={s.list}>
      {items.map((r, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lista fixa por resposta
        <li className={s.listItem} key={i}>
          <span className={r.mandatory ? 'rg-tag rg-tag-accent' : 'rg-tag'}>
            {r.mandatory ? 'Obrigatório' : 'Não indica'}
          </span>
          <div className={s.listBody}>
            <span>{r.text}</span>
            <Citations items={r.citations} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Todos os trechos citados pela análise, sem repetir, na ordem em que aparecem. */
function collectCitations(a: Analysis): Citation[] {
  const all: Citation[] = [
    ...a.key_dates.flatMap((d) => d.citations),
    ...a.eligibility.flatMap((r) => r.citations),
    ...a.technical_requirements.flatMap((r) => r.citations),
    ...a.proposal_requirements.flatMap((r) => r.citations),
    ...a.risks.flatMap((r) => r.citations),
    ...a.clauses_of_attention.flatMap((c) => c.citations),
  ];
  const seen = new Set<string>();
  return all.filter((c) => {
    const k = citeKey(c);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Painel do documento (esquerda): os trechos do edital que a análise cita, agrupados por documento e página. */
function DocumentPane({
  data,
  quotes,
  active,
}: {
  data: AnalysisResponse;
  quotes: Citation[];
  active: string | null;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => {
    const by = new Map<string, Citation[]>();
    for (const c of quotes) by.set(c.document, [...(by.get(c.document) ?? []), c]);
    return [...by.entries()].map(([doc, list]) => ({
      doc,
      list: [...list].sort((a, b) => (a.page ?? 0) - (b.page ?? 0)),
    }));
  }, [quotes]);

  // Ao escolher uma citação na análise, o painel do documento rola até o trecho.
  useEffect(() => {
    if (!active || !scroller.current) return;
    const el = [...scroller.current.querySelectorAll<HTMLElement>('[data-key]')].find(
      (n) => n.dataset.key === active,
    );
    if (el)
      scroller.current.scrollTo({
        top: el.offsetTop - scroller.current.offsetTop - 12,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
  }, [active]);

  return (
    <aside className={s.docPane} aria-label="Trechos do edital citados na análise">
      <div className={s.docPaneHead}>
        <h3>Documento</h3>
        <p>
          {data.documents_used.length > 0
            ? data.documents_used
                .map((d) => `${d.title}${d.pages ? ` (${d.pages} págs.)` : ''}`)
                .join('; ')
            : 'Trechos citados pela análise'}
        </p>
      </div>
      <div className={s.docScroll} ref={scroller}>
        {groups.length === 0 ? (
          <p className={s.excerptEmpty}>
            A análise não citou trechos. Abra os documentos do edital para conferir.
          </p>
        ) : (
          groups.map((g) => (
            <section className={s.docGroup} key={g.doc}>
              <h4 className={s.docGroupTitle}>{g.doc}</h4>
              {g.list.map((c) => {
                const key = citeKey(c);
                return (
                  <blockquote
                    key={key}
                    className={s.excerpt}
                    data-key={key}
                    data-active={active === key || undefined}
                    data-verified={c.verified}
                  >
                    <div className={s.excerptWhere}>
                      <span>{c.page != null ? `página ${c.page}` : 'sem página'}</span>
                      {c.verified ? (
                        <span className="rg-tag rg-tag-success">conferido no edital</span>
                      ) : (
                        <span className="rg-tag rg-tag-warning">não conferido</span>
                      )}
                    </div>
                    {c.quote}
                  </blockquote>
                );
              })}
            </section>
          ))
        )}
      </div>
    </aside>
  );
}

/** Resultado do Leitor de editais (docs/09 §3). Tudo vem pronto do servidor: a tela só desenha. */
export function AnalysisView({ data }: { data: AnalysisResponse }) {
  const a = data.analysis;
  const [active, setActive] = useState<string | null>(null);
  const quotes = useMemo(() => (a ? collectCitations(a) : []), [a]);

  if (data.status === 'no_text' || !a) {
    return (
      <div className="rg-banner rg-banner-warning" role="status">
        <div className="rg-banner-body">
          <p className="rg-banner-title">Não consegui ler o texto deste edital.</p>
          <p>
            {data.reason ??
              'O edital não tem um documento com texto que a Régua consiga ler. Abra os documentos no PNCP.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ReaderContext.Provider value={{ active, focus: setActive }}>
      <div className={s.reader}>
        <DocumentPane data={data} quotes={quotes} active={active} />

        <div className={s.result}>
          <div className={s.resultHead}>
            <div className={s.metaRow}>
              <span className="rg-src rg-src-model">Rascunho gerado por IA</span>
              <span>Modelo {data.meta.model}</span>
              <span>{Math.round(data.meta.took_ms / 1000)} s</span>
              {data.meta.cached ? <span className="rg-tag">resultado guardado</span> : null}
              <span>
                {data.citations_verified} de {data.citations_total} citações conferidas no edital
              </span>
            </div>
            {data.meta.truncated ? (
              <div className="rg-banner rg-banner-warning" role="status">
                <div className="rg-banner-body">
                  <p className="rg-banner-title">Leitura parcial</p>
                  <p>
                    O edital é longo: a análise usou só o começo do texto. O que vem depois pode não
                    estar aqui. Confira o documento inteiro.
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <section className={s.section} aria-labelledby="an-resumo">
            <h3 id="an-resumo">Resumo</h3>
            <p>{a.summary}</p>
            {a.object ? <p className={s.note}>Objeto: {a.object}</p> : null}
          </section>

          <section className={s.section} aria-labelledby="an-datas">
            <h3 id="an-datas">Datas importantes</h3>
            {a.key_dates.length === 0 ? (
              <p className={s.empty}>Nenhuma data identificada.</p>
            ) : (
              <div className={s.list}>
                {a.key_dates.map((d, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: lista fixa por resposta
                  <div key={i}>
                    <div className={s.dateRow}>
                      <span className={s.dateLabel}>{d.label}</span>
                      <span className={s.num}>{showDate(d.at)}</span>
                    </div>
                    <Citations items={d.citations} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={s.section} aria-labelledby="an-hab">
            <h3 id="an-hab">Habilitação</h3>
            <Reqs items={a.eligibility} />
          </section>

          <section className={s.section} aria-labelledby="an-tec">
            <h3 id="an-tec">Exigências técnicas</h3>
            <Reqs items={a.technical_requirements} />
          </section>

          <section className={s.section} aria-labelledby="an-prop">
            <h3 id="an-prop">O que a proposta precisa ter</h3>
            <Reqs items={a.proposal_requirements} />
          </section>

          <section className={s.section} aria-labelledby="an-riscos">
            <h3 id="an-riscos">Riscos</h3>
            {a.risks.length === 0 ? (
              <p className={s.empty}>Nenhum risco identificado pela leitura.</p>
            ) : (
              <ul className={s.list}>
                {a.risks.map((r, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: lista fixa por resposta
                  <li className={s.listItem} key={i}>
                    <span className={LEVEL[r.level].tag}>{LEVEL[r.level].label}</span>
                    <div className={s.listBody}>
                      <span>{r.description}</span>
                      <Citations items={r.citations} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={s.section} aria-labelledby="an-clausulas">
            <h3 id="an-clausulas">Cláusulas que merecem atenção</h3>
            {a.clauses_of_attention.length === 0 ? (
              <p className={s.empty}>Nenhuma cláusula destacada.</p>
            ) : (
              <ul className={s.list}>
                {a.clauses_of_attention.map((c, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: lista fixa por resposta
                  <li className={s.listBody} key={i}>
                    <span>{c.topic}</span>
                    <Citations items={c.citations} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={s.section} aria-labelledby="an-nao">
            <h3 id="an-nao">O que o edital não esclarece</h3>
            {a.unknowns.length === 0 ? (
              <p className={s.empty}>Nada identificado.</p>
            ) : (
              <ul className={s.unknowns}>
                {a.unknowns.map((u, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: lista fixa por resposta
                  <li key={i}>{u}</li>
                ))}
              </ul>
            )}
          </section>

          <p className={s.disclaimer}>{data.disclaimer}</p>
        </div>
      </div>
    </ReaderContext.Provider>
  );
}
