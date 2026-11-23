import { createHash } from 'node:crypto';
import type { ProcurementStatus } from '@agora/contracts';
import type { NormalizedProcurement, QualityFlag } from '../types';
import { maskPii } from './pii';
import type { PncpContratacao } from './schema';
import { mapSphere, mapStatusFromName } from './tables';
import { brtToUtcIso } from './time';

const MIN_PLAUSIBLE_YEAR = 2021; // Lei 14.133/2021 e PNCP (docs/05 §6)
const MAX_YEARS_AHEAD = 5;
const ABSURD_VALUE = 1e12;

function yearOf(iso: string | null): number | null {
  return iso ? new Date(iso).getUTCFullYear() : null;
}

/** PNCP → modelo canônico, defensivo (docs/05 §6): datas em UTC, `quality_flags`, PII mascarada, hash de conteúdo. */
export function normalizeContratacao(
  c: PncpContratacao,
  now: Date = new Date(),
): NormalizedProcurement {
  const flags = new Set<QualityFlag>();

  const objectRaw = c.objetoCompra;
  const { text: masked, masked: didMask } = maskPii(objectRaw);
  if (didMask) flags.add('pii_masked');
  const objectText = masked.replace(/\s+/g, ' ').trim();

  const publishedAt = brtToUtcIso(c.dataPublicacaoPncp ?? c.dataInclusao);
  const proposalsOpenAt = brtToUtcIso(c.dataAberturaProposta);
  const proposalsCloseAt = brtToUtcIso(c.dataEncerramentoProposta);
  const pncpUpdatedAt = brtToUtcIso(c.dataAtualizacaoGlobal ?? c.dataAtualizacao);

  const maxYear = now.getUTCFullYear() + MAX_YEARS_AHEAD;
  for (const iso of [publishedAt, proposalsOpenAt, proposalsCloseAt]) {
    const y = yearOf(iso);
    if (y !== null && (y < MIN_PLAUSIBLE_YEAR || y > maxYear)) flags.add('date_suspect');
  }
  if (proposalsOpenAt && proposalsCloseAt && proposalsCloseAt < proposalsOpenAt) {
    flags.add('proposal_dates_inverted');
  }

  const estimatedValue = c.valorTotalEstimado ?? null;
  if (estimatedValue === null) flags.add('value_missing');
  else if (estimatedValue <= 0 || estimatedValue >= ABSURD_VALUE) flags.add('value_suspect');

  const unit = c.unidadeOrgao ?? null;
  const uf = unit?.ufSigla ? unit.ufSigla.toUpperCase() : null;
  if (!uf) flags.add('organ_incomplete');

  const statusRaw = c.situacaoCompraNome;
  const mapped = mapStatusFromName(statusRaw);
  let status: ProcurementStatus;
  if (mapped === 'divulgada') {
    if (!proposalsCloseAt) status = 'unknown';
    else status = new Date(proposalsCloseAt) > now ? 'open_for_proposals' : 'closed';
  } else {
    status = mapped;
  }
  const isOpen = status === 'open_for_proposals';

  const organCnpj = c.orgaoEntidade.cnpj;
  const contentHash = createHash('sha256')
    .update(
      JSON.stringify([
        objectText,
        c.modalidadeId,
        statusRaw,
        estimatedValue,
        proposalsOpenAt,
        proposalsCloseAt,
        organCnpj,
        uf,
        unit?.codigoIbge ?? null,
        c.numeroCompra ?? null,
      ]),
    )
    .digest('hex');

  return {
    source: 'pncp',
    numeroControlePncp: c.numeroControlePNCP,
    organ: {
      cnpj: organCnpj,
      name: c.orgaoEntidade.razaoSocial,
      sphere: mapSphere(c.orgaoEntidade.esferaId),
      power: c.orgaoEntidade.poderId ?? null,
      uf,
      municipalityIbge: unit?.codigoIbge ?? null,
      municipalityName: unit?.municipioNome ?? null,
      unitName: unit?.nomeUnidade ?? null,
    },
    processNumber: c.processo?.trim() || null,
    editalNumber: c.numeroCompra?.trim() || null,
    year: c.anoCompra,
    sequence: c.sequencialCompra,
    modality: c.modalidadeId,
    modalityName: c.modalidadeNome,
    status,
    statusRaw,
    objectText,
    objectRaw,
    estimatedValue,
    publishedAt,
    proposalsOpenAt,
    proposalsCloseAt,
    pncpUpdatedAt,
    srp: c.srp ?? false,
    isOpen,
    qualityFlags: [...flags].sort(),
    contentHash,
    sourceUrl: `https://pncp.gov.br/app/editais/${organCnpj}/${c.anoCompra}/${c.sequencialCompra}`,
    originSystemUrl: c.linkSistemaOrigem?.trim() || null,
  };
}
