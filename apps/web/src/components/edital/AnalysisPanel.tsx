'use client';

import type { AnalysisResponse } from '@agora/contracts';
import { useEffect, useRef, useState } from 'react';
import { markAnalyzed } from '@/lib/analyzed';
import { callLong } from '@/lib/call';
import type { Failure } from '@/lib/failure';
import { Icon } from '../Icon';
import { AnalysisView } from './AnalysisView';
import s from './edital.module.css';
import { ReadPdfFromContext } from './ReadPdfButton';

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading'; startedAt: number }
  | { kind: 'done'; data: AnalysisResponse }
  | { kind: 'error'; failure: Failure };

function Elapsed({ startedAt }: { startedAt: number }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setSec(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  return <span aria-hidden="true">{sec} s</span>;
}

/**
 * Leitor de edital: o servidor baixa os documentos, lê o texto e a IA extrai exigências e riscos, cada um com a
 * página de onde saiu. A chamada leva de 20 a 90 s e responde só no final, então o progresso não finge porcentagem.
 */
export function AnalysisPanel({ procurementId }: { procurementId: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function run() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase({ kind: 'loading', startedAt: Date.now() });
    const r = await callLong<AnalysisResponse>(
      '/ai/analyses',
      { method: 'POST', body: { procurement_id: procurementId } },
      { signal: ctrl.signal },
    );
    if (abortRef.current !== ctrl) return;
    if (r.ok) {
      setPhase({ kind: 'done', data: r.data });
      if (r.data.status === 'ready') markAnalyzed(procurementId);
    } else if (r.cancelled) {
      setPhase({ kind: 'idle' });
    } else {
      setPhase({ kind: 'error', failure: r.failure });
    }
  }

  const doneAt = phase.kind === 'done' ? phase.data.server_now : null;
  useEffect(() => {
    if (doneAt) headingRef.current?.focus();
  }, [doneAt]);

  return (
    <div className={s.stack}>
      {phase.kind === 'idle' || phase.kind === 'error' ? (
        <div className={s.analyze}>
          <h3>Leitor de editais</h3>
          <p>
            A IA lê os documentos do edital e separa a habilitação, as exigências técnicas, o que a
            proposta precisa ter e os riscos, sempre com a página de onde saiu. Leva de 20 a 90
            segundos.
          </p>
          <ol className={s.readSteps}>
            <li>Ler com IA</li>
            <li>Resumo e habilitação</li>
            <li>Prazos e riscos, com a página citada</li>
            <li>Abrir a citação no PDF</li>
          </ol>
          <div className={s.analyzeActions}>
            <button type="button" className="rg-btn rg-btn-primary" onClick={run}>
              <Icon name="sparkle" size={14} /> Ler com IA
            </button>
            <ReadPdfFromContext />
          </div>
        </div>
      ) : null}

      {phase.kind === 'loading' ? (
        <div className={s.progress} aria-busy="true">
          <div className={s.progressHead}>
            <p className={s.progressTitle}>
              <span className={s.spinDot} aria-hidden="true" />
              Lendo os documentos do edital…
            </p>
            <button type="button" className="rg-btn" onClick={() => abortRef.current?.abort()}>
              Cancelar
            </button>
          </div>
          <p className={s.srOnly} role="status" aria-live="polite">
            Lendo o edital. Isso leva de 20 a 90 segundos.
          </p>
          <p className={s.note}>
            Isso leva de 20 a 90 segundos (<Elapsed startedAt={phase.startedAt} />
            ). O servidor responde só no final; por isso não há porcentagem.
          </p>
        </div>
      ) : null}

      {phase.kind === 'error' ? (
        <div className="rg-banner rg-banner-error" role="alert">
          <div className="rg-banner-body">
            <p className="rg-banner-title">{phase.failure.title}</p>
            <p>{phase.failure.detail}</p>
          </div>
          {phase.failure.retryable ? (
            <button type="button" className="rg-btn" onClick={run}>
              <Icon name="refresh" size={14} /> Tentar de novo
            </button>
          ) : null}
        </div>
      ) : null}

      {phase.kind === 'done' ? (
        <>
          <h3 className={s.srOnly} tabIndex={-1} ref={headingRef}>
            Resultado da análise do edital
          </h3>
          <AnalysisView data={phase.data} />
          <button type="button" className={`rg-btn ${s.reanalyze}`} onClick={run}>
            <Icon name="refresh" size={14} /> Analisar de novo
          </button>
        </>
      ) : null}
    </div>
  );
}
