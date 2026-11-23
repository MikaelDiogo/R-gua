import type { Db } from '@agora/db';
import { PncpClient } from './pncp/client';
import { PncpConnector } from './pncp/connector';
import { ALL_MODALITIES } from './pncp/tables';
import type { NormalizedProcurement } from './types';

export interface VerifyOptions {
  client?: PncpClient;
  now?: () => Date;
  /** Confere também modalidade por modalidade (13 chamadas a mais) e compara com a consulta sem filtro. */
  crossCheck?: boolean;
}

export interface VerifyItem {
  numeroControlePncp: string;
  modality: number;
  modalityName: string;
  object: string;
}

export interface VerifyResult {
  /** Propostas abertas do município, segundo o PNCP agora. */
  pncp: VerifyItem[];
  /** Quantas dessas já estão no banco. */
  inDb: number;
  /** O que o PNCP tem e o banco NÃO tem. */
  missing: VerifyItem[];
  /** A consulta sem filtro de modalidade bate com a soma das modalidades? (null = não conferido) */
  crossCheckMatches: boolean | null;
  /** true se alguma consulta ao PNCP falhou: o resultado não prova nada. */
  incomplete: boolean;
}

const toItem = (p: NormalizedProcurement): VerifyItem => ({
  numeroControlePncp: p.numeroControlePncp,
  modality: p.modality,
  modalityName: p.modalityName,
  object: p.objectText.slice(0, 90),
});

/**
 * Conferência SOMENTE LEITURA: compara as propostas abertas de um município no PNCP com o que o banco tem.
 * Não grava nada. Serve para provar que a busca "traz 100%" (ex.: Crateús, 2304103).
 */
export async function verifyMunicipality(
  db: Db,
  ibge: string,
  opts: VerifyOptions = {},
): Promise<VerifyResult> {
  const clock = opts.now ?? (() => new Date());
  const client = opts.client ?? new PncpClient({ maxCallsPerMinute: 20 });
  const connector = new PncpConnector({ client, now: clock });
  const until = new Date(clock().getTime() + 365 * 86_400_000);

  let incomplete = false;
  const all = await connector.fetch(
    connector.openProposalsWindow(until, undefined, undefined, ibge),
  );
  if (!all.complete) incomplete = true;
  const byKey = new Map(all.items.map((p) => [p.numeroControlePncp, toItem(p)]));

  let crossCheckMatches: boolean | null = null;
  if (opts.crossCheck ?? true) {
    const union = new Map<string, VerifyItem>();
    for (const modality of ALL_MODALITIES) {
      const r = await connector.fetch(
        connector.openProposalsWindow(until, modality, undefined, ibge),
      );
      if (!r.complete) incomplete = true;
      for (const p of r.items) union.set(p.numeroControlePncp, toItem(p));
    }
    crossCheckMatches = union.size === byKey.size && [...union.keys()].every((k) => byKey.has(k));
    // Se a consulta sem filtro perdeu algo, a conferência por modalidade vale mais.
    for (const [k, v] of union) byKey.set(k, v);
  }

  const pncp = [...byKey.values()];
  const keys = pncp.map((p) => p.numeroControlePncp);
  const found = keys.length
    ? await db.query<{ numero_controle_pncp: string }>(
        'SELECT numero_controle_pncp FROM procurements WHERE numero_controle_pncp = ANY($1)',
        [keys],
      )
    : { rows: [] as Array<{ numero_controle_pncp: string }> };
  const have = new Set(found.rows.map((r) => r.numero_controle_pncp));
  return {
    pncp,
    inDb: pncp.filter((p) => have.has(p.numeroControlePncp)).length,
    missing: pncp.filter((p) => !have.has(p.numeroControlePncp)),
    crossCheckMatches,
    incomplete,
  };
}
