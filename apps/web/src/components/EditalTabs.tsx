'use client';

import type { ProcurementDetail } from '@agora/contracts';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { fmtDateTime } from '@/lib/format';
import { useCollect } from '@/lib/use-collect';
import { AnalysisPanel } from './edital/AnalysisPanel';
import { PdfDocsContext } from './edital/Citations';
import { DocumentsList } from './edital/DocumentsList';
import s from './edital/edital.module.css';
import { ItemsTable } from './edital/ItemsTable';
import { Icon } from './Icon';

type TabId = 'resumo' | 'ia' | 'itens' | 'documentos' | 'perguntas';
const TABS: { id: TabId; label: string }[] = [
  { id: 'resumo', label: 'Dados do edital' },
  { id: 'ia', label: 'Leitor de editais' },
  { id: 'itens', label: 'Itens' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'perguntas', label: 'Perguntas' },
];

const Dash = () => (
  <span className={s.dash} role="img" aria-label="Não informado">
    —
  </span>
);

/** Estado com moldura (vazio): título, explicação e, se houver, ação. */
function EmptyBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rg-empty">
      <div className="rg-empty-body">
        <p className="rg-empty-title">{title}</p>
        <p>{children}</p>
      </div>
    </div>
  );
}

const SPHERE: Record<string, string> = {
  federal: 'Federal',
  state: 'Estadual',
  municipal: 'Municipal',
};

/** Itens e documentos: coleta automática do PNCP, com carregando, erro e "Tentar de novo". */
function CollectGate({
  phase,
  failure,
  retry,
  what,
  children,
}: {
  phase: 'idle' | 'loading' | 'error';
  failure: { title: string; detail: string } | null;
  retry: () => void;
  what: string;
  children: React.ReactNode;
}) {
  if (phase === 'loading') {
    return (
      <div className={s.collecting} role="status" aria-live="polite">
        <span className={s.spinDot} aria-hidden="true" />
        Buscando itens e documentos no PNCP…
      </div>
    );
  }
  if (phase === 'error') {
    return (
      <div className="rg-banner rg-banner-error" role="alert">
        <div className="rg-banner-body">
          <p className="rg-banner-title">
            {failure?.title ?? `Não foi possível buscar ${what} no PNCP.`}
          </p>
          <p>{failure?.detail ?? `Isso não quer dizer que o edital não tenha ${what}.`}</p>
        </div>
        <button type="button" className="rg-btn" onClick={retry}>
          <Icon name="refresh" size={14} /> Tentar de novo
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

export function EditalTabs({ edital: initial }: { edital: ProcurementDetail }) {
  const { detail: edital, phase, failure, retry } = useCollect(initial);
  const [tab, setTab] = useState<TabId>('resumo');
  const listRef = useRef<HTMLDivElement>(null);

  // Links como "Analisar com IA" (#ia) abrem a aba pedida.
  useEffect(() => {
    const open = () => {
      const id = window.location.hash.slice(1);
      const t = TABS.find((x) => x.id === id);
      if (t) {
        setTab(t.id);
        document.getElementById('abas')?.scrollIntoView({ block: 'start' });
      }
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next =
      e.key === 'ArrowRight'
        ? i + 1
        : e.key === 'ArrowLeft'
          ? i - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? TABS.length - 1
              : null;
    if (next == null) return;
    e.preventDefault();
    const t = TABS[(next + TABS.length) % TABS.length];
    if (!t) return;
    setTab(t.id);
    listRef.current?.querySelector<HTMLButtonElement>(`#tab-${t.id}`)?.focus();
  };

  const rows: [string, string | null][] = [
    ['Número de controle no PNCP', edital.numero_controle_pncp],
    ['Número do edital', edital.edital_number],
    ['Número do processo', edital.process_number],
    ['Ano e sequencial', `${edital.year} · ${edital.sequence}`],
    ['Situação no PNCP', edital.status_raw],
    ['Registro de preços', edital.srp ? 'Sim' : 'Não'],
    ['Esfera', edital.sphere ? (SPHERE[edital.sphere] ?? edital.sphere) : null],
    ['Unidade compradora', edital.unit_name],
    ['CNPJ do órgão', edital.organ.cnpj],
    ['Publicado em', edital.published_at ? fmtDateTime(edital.published_at) : null],
    [
      'Propostas a partir de',
      edital.proposals_open_at ? fmtDateTime(edital.proposals_open_at) : null,
    ],
    ['Propostas até', edital.proposals_close_at ? fmtDateTime(edital.proposals_close_at) : null],
  ];

  return (
    <PdfDocsContext.Provider
      value={{
        procurementId: edital.id,
        documents: edital.documents.collected ? edital.documents.list : [],
      }}
    >
      <div>
        <div>
          <div
            className={s.tablist}
            id="abas"
            role="tablist"
            aria-label="Seções do edital"
            ref={listRef}
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                type="button"
                className={s.tab}
                role="tab"
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={onKey}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'resumo' && (
              <dl className={s.factList}>
                {rows.map(([k, v]) => (
                  <div className={s.fact} key={k}>
                    <dt>{k}</dt>
                    <dd>{v ?? <Dash />}</dd>
                  </div>
                ))}
              </dl>
            )}

            {tab === 'ia' && <AnalysisPanel procurementId={edital.id} />}

            {tab === 'itens' && (
              <CollectGate phase={phase} failure={failure} retry={retry} what="os itens">
                {edital.items.collected ? (
                  <ItemsTable items={edital.items.list} />
                ) : (
                  <EmptyBlock title="Os itens ainda não foram coletados do PNCP.">
                    Isso não quer dizer que o edital não tenha itens. Confira no PNCP.
                  </EmptyBlock>
                )}
              </CollectGate>
            )}

            {tab === 'documentos' && (
              <CollectGate phase={phase} failure={failure} retry={retry} what="os documentos">
                {edital.documents.collected ? (
                  <DocumentsList docs={edital.documents.list} procurementId={edital.id} />
                ) : (
                  <EmptyBlock title="Os documentos ainda não foram coletados.">
                    Edital e anexos estão no PNCP.
                  </EmptyBlock>
                )}
              </CollectGate>
            )}

            {tab === 'perguntas' && (
              <div className={s.stack}>
                <EmptyBlock title="As perguntas ao edital ainda não estão disponíveis.">
                  Primeiro vem a análise do edital. Perguntar ao edital, com resposta e página
                  citada, é a etapa seguinte.
                </EmptyBlock>
                <form className={s.ask} onSubmit={(e) => e.preventDefault()}>
                  <label htmlFor="ask" className={s.srOnly}>
                    Pergunta sobre o edital
                  </label>
                  <textarea id="ask" rows={2} placeholder="Pergunte algo sobre o edital" disabled />
                  <button type="submit" className="rg-btn rg-btn-primary" disabled>
                    Perguntar
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </PdfDocsContext.Provider>
  );
}
