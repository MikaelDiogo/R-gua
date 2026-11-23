'use client';

import type { ProcurementDetail } from '@agora/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { callLong } from './call';
import type { Failure } from './failure';

export type CollectPhase = 'idle' | 'loading' | 'error';

/**
 * Coleta sob demanda dos itens e documentos no PNCP (POST /procurements/{id}/collect). Roda sozinha, uma vez,
 * quando o edital ainda não foi coletado. `collected=false` nunca é lido como "sem itens".
 */
export function useCollect(initial: ProcurementDetail) {
  const [detail, setDetail] = useState(initial);
  const needs = !initial.items.collected || !initial.documents.collected;
  const [phase, setPhase] = useState<CollectPhase>(needs ? 'loading' : 'idle');
  const [failure, setFailure] = useState<Failure | null>(null);
  const started = useRef(false);

  const run = useCallback(async () => {
    setPhase('loading');
    setFailure(null);
    const r = await callLong<ProcurementDetail>(
      `/procurements/${encodeURIComponent(initial.id)}/collect`,
      { method: 'POST' },
      { timeoutMs: 40_000 },
    );
    if (r.ok) {
      setDetail(r.data);
      setPhase('idle');
    } else {
      setFailure(r.failure);
      setPhase('error');
    }
  }, [initial.id]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: roda só na montagem
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (needs) void run();
  }, []);

  return { detail, phase, failure, retry: run };
}
