import type { ProcurementDetail, ProcurementSummary } from '@agora/contracts';
import { computeDeadline } from '@agora/domain';
import { highlight } from '../search/highlight';

/** Colunas lidas para montar o resumo (alias `p` = procurements, `o` = organs). */
export const SUMMARY_COLUMNS = `
  p.id, p.numero_controle_pncp, p.object_text, p.organ_cnpj, o.name AS organ_name, p.uf, p.municipality_name,
  p.modality, p.modality_name, p.status, p.estimated_value, p.published_at, p.proposals_open_at, p.proposals_close_at,
  p.quality_flags, p.source_url, p.origin_url`;

export const DETAIL_COLUMNS = `${SUMMARY_COLUMNS},
  p.process_number, p.edital_number, p.year, p.sequence, p.srp, p.status_raw, o.sphere, p.unit_name, p.municipality_ibge`;

export interface SummaryRow {
  id: string;
  numero_controle_pncp: string;
  object_text: string;
  organ_cnpj: string;
  organ_name: string;
  uf: string | null;
  municipality_name: string | null;
  modality: number;
  modality_name: string;
  status: string;
  estimated_value: string | null;
  published_at: Date | null;
  proposals_open_at: Date | null;
  proposals_close_at: Date | null;
  quality_flags: string[];
  source_url: string | null;
  origin_url: string | null;
}

export interface DetailRow extends SummaryRow {
  process_number: string | null;
  edital_number: string | null;
  year: number;
  sequence: number;
  srp: boolean;
  status_raw: string;
  sphere: string | null;
  unit_name: string | null;
  municipality_ibge: string | null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toSummary(r: SummaryRow, now: Date, q?: string): ProcurementSummary {
  // O status gravado na ingestão envelhece: "aberto" com prazo vencido é mostrado como encerrado.
  const status =
    r.status === 'open_for_proposals' && r.proposals_close_at && r.proposals_close_at <= now
      ? 'closed'
      : (r.status as ProcurementSummary['status']);
  const segments = q ? highlight(r.object_text, q) : null;
  return {
    id: r.id,
    numero_controle_pncp: r.numero_controle_pncp,
    object: r.object_text,
    highlight: segments,
    organ: { cnpj: r.organ_cnpj, name: r.organ_name, uf: r.uf, municipality: r.municipality_name },
    modality: { code: r.modality, name: r.modality_name },
    status,
    estimated_value: r.estimated_value === null ? null : Number(r.estimated_value),
    published_at: iso(r.published_at),
    proposals_open_at: iso(r.proposals_open_at),
    proposals_close_at: iso(r.proposals_close_at),
    deadline: computeDeadline(r.proposals_open_at, r.proposals_close_at, now),
    quality_flags: r.quality_flags,
    match: q ? 'lexical' : null,
    source_url: r.source_url,
    origin_url: r.origin_url,
  };
}

export function toDetail(r: DetailRow, now: Date): ProcurementDetail {
  return {
    ...toSummary(r, now),
    process_number: r.process_number,
    edital_number: r.edital_number,
    year: r.year,
    sequence: r.sequence,
    srp: r.srp,
    status_raw: r.status_raw,
    sphere: r.sphere,
    unit_name: r.unit_name,
    municipality_ibge: r.municipality_ibge,
    items: { collected: false, list: [] },
    documents: { collected: false, list: [] },
  };
}
