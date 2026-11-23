import { z } from 'zod';

/** Item de uma contratação, coletado do PNCP sob demanda. */
export const ProcurementItem = z.object({
  number: z.number().int(),
  description: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  unit_value: z.number().nullable(),
  total_value: z.number().nullable(),
  kind: z.string().nullable(),
  situation: z.string().nullable(),
});
export type ProcurementItem = z.infer<typeof ProcurementItem>;

export const ProcurementDocument = z.object({
  sequence: z.number().int(),
  title: z.string(),
  type: z.string(),
  url: z.string(),
  /** pending | ok | failed | too_large | scanned (PDF sem texto: OCR ainda não existe) */
  text_status: z.enum(['pending', 'ok', 'failed', 'too_large', 'scanned', 'unsupported']),
  pages: z.number().int().nullable(),
});
export type ProcurementDocument = z.infer<typeof ProcurementDocument>;

/** ── Leitor de edital (docs/09 §3) ─────────────────────────────────────── */
export const Citation = z.object({
  document: z.string(),
  page: z.number().int().nullable(),
  quote: z.string(),
  /** true só se o trecho existe, literalmente, na página citada (o servidor confere). */
  verified: z.boolean(),
});
export type Citation = z.infer<typeof Citation>;

export const Requirement = z.object({
  text: z.string(),
  /** Quem escreveu o edital é quem decide: "obrigatório" só quando o texto diz. */
  mandatory: z.boolean(),
  citations: z.array(Citation),
});

export const EditalAnalysis = z.object({
  summary: z.string(),
  object: z.string(),
  key_dates: z.array(
    z.object({ label: z.string(), at: z.string().nullable(), citations: z.array(Citation) }),
  ),
  eligibility: z.array(Requirement),
  technical_requirements: z.array(Requirement),
  proposal_requirements: z.array(Requirement),
  risks: z.array(
    z.object({
      level: z.enum(['low', 'medium', 'high']),
      description: z.string(),
      citations: z.array(Citation),
    }),
  ),
  clauses_of_attention: z.array(z.object({ topic: z.string(), citations: z.array(Citation) })),
  /** O que o edital não esclarece. */
  unknowns: z.array(z.string()),
});
export type EditalAnalysis = z.infer<typeof EditalAnalysis>;

export const AnalysisResponse = z.object({
  procurement_id: z.string().uuid(),
  status: z.enum(['ready', 'no_text']),
  /** Quando `no_text`: por que não deu para ler (sem documento, PDF escaneado, grande demais...). */
  reason: z.string().nullable(),
  analysis: EditalAnalysis.nullable(),
  documents_used: z.array(
    z.object({ title: z.string(), pages: z.number().int().nullable(), text_status: z.string() }),
  ),
  citations_total: z.number().int(),
  citations_verified: z.number().int(),
  meta: z.object({
    model: z.string(),
    tokens_in: z.number().int().nullable(),
    tokens_out: z.number().int().nullable(),
    took_ms: z.number().int(),
    cached: z.boolean(),
    truncated: z.boolean(),
  }),
  disclaimer: z.string(),
  server_now: z.string().datetime(),
});
export type AnalysisResponse = z.infer<typeof AnalysisResponse>;

export const AnalyzeRequest = z.object({ procurement_id: z.string().uuid() }).strict();

/** ── Perfil da empresa ─────────────────────────────────────────────────── */
export const Porte = z.enum(['mei', 'me', 'epp', 'media', 'grande']);

export const CompanyProfile = z.object({
  legal_name: z.string().max(200),
  cnpj: z.string().max(18),
  trade_name: z.string().max(200).nullable(),
  porte: Porte.nullable(),
  segments: z.array(z.string().max(80)).max(20),
  ufs: z.array(z.string().length(2)).max(27),
  email: z.string().max(200).nullable(),
  phone: z.string().max(40).nullable(),
  address: z.string().max(300).nullable(),
  legal_rep_name: z.string().max(200).nullable(),
  legal_rep_role: z.string().max(100).nullable(),
  certificates: z
    .array(z.object({ name: z.string().max(120), valid_until: z.string().nullable() }))
    .max(30),
  technical_attestations: z.string().max(4000).nullable(),
});
export type CompanyProfile = z.infer<typeof CompanyProfile>;

export const CompanyProfileResponse = z.object({
  profile: CompanyProfile.nullable(),
  version: z.number().int(),
  /** Campos que a proposta precisa e ainda faltam. */
  missing_for_proposal: z.array(z.string()),
  server_now: z.string().datetime(),
});
export type CompanyProfileResponse = z.infer<typeof CompanyProfileResponse>;
export const SaveCompanyProfile = CompanyProfile.strict();

/** ── Proposta ──────────────────────────────────────────────────────────── */
export const GenerateProposalRequest = z
  .object({
    procurement_id: z.string().uuid(),
    /** Preço unitário informado pelo usuário por item. O servidor calcula totais; a IA nunca inventa preço. */
    prices: z
      .array(z.object({ item_number: z.number().int(), unit_price: z.number().nonnegative() }))
      .max(500),
    notes: z.string().max(1000).optional(),
  })
  .strict();
export type GenerateProposalRequest = z.infer<typeof GenerateProposalRequest>;

export const ProposalSection = z.object({
  key: z.enum(['cover_letter', 'technical_description', 'declarations', 'validity_and_conditions']),
  title: z.string(),
  /** Texto com marcadores [PREENCHER: …] para o que a IA não tinha como saber. */
  body: z.string(),
});

export const Proposal = z.object({
  id: z.string().uuid(),
  procurement_id: z.string().uuid(),
  procurement_object: z.string(),
  organ_name: z.string(),
  sections: z.array(ProposalSection),
  /** Tabela de itens montada e somada pelo servidor. */
  items: z.array(
    z.object({
      number: z.number().int(),
      description: z.string(),
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
      unit_price: z.number().nullable(),
      total: z.number().nullable(),
      /** Estimado pelo órgão, para comparar com o seu preço. */
      reference_unit_value: z.number().nullable(),
      above_reference: z.boolean(),
    }),
  ),
  total: z.number(),
  placeholders: z.array(z.string()),
  warnings: z.array(z.string()),
  version: z.number().int(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  meta: z.object({ model: z.string(), took_ms: z.number().int().nullable() }),
  disclaimer: z.string(),
});
export type Proposal = z.infer<typeof Proposal>;

export const ProposalList = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      procurement_id: z.string().uuid(),
      procurement_object: z.string(),
      organ_name: z.string(),
      total: z.number(),
      updated_at: z.string().datetime(),
    }),
  ),
  server_now: z.string().datetime(),
});

export const UpdateProposalRequest = z
  .object({
    sections: z
      .array(z.object({ key: ProposalSection.shape.key, body: z.string().max(20000) }))
      .max(8),
  })
  .strict();

/** ── Precificador ──────────────────────────────────────────────────────── */
export const PricingBenchmarkItem = z.object({
  item_number: z.number().int(),
  description: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  edital_unit_value: z.number().nullable(),
  comparables: z.object({
    n: z.number().int(),
    median: z.number().nullable(),
    q1: z.number().nullable(),
    q3: z.number().nullable(),
    min: z.number().nullable(),
    max: z.number().nullable(),
    outliers_removed: z.number().int(),
  }),
  /** none = sem amostra; low = n pequeno ou dados com problema; medium; high. Nunca finge precisão. */
  confidence: z.enum(['none', 'low', 'medium', 'high']),
  notes: z.array(z.string()),
});

export const PricingBenchmarkResponse = z.object({
  procurement_id: z.string().uuid(),
  items: z.array(PricingBenchmarkItem),
  collected_items: z.boolean(),
  /** Quantos itens de outras contratações estão na base para comparar (a base é parcial). */
  base_items: z.number().int(),
  server_now: z.string().datetime(),
});
export type PricingBenchmarkResponse = z.infer<typeof PricingBenchmarkResponse>;

export const PricingSimulationRequest = z
  .object({
    cost: z.number().positive(),
    taxes_pct: z.number().min(0).max(100),
    margin_pct: z.number().min(0).max(1000),
    quantity: z.number().positive().default(1),
    /** Valor de referência do órgão (opcional) para checar se o preço cabe. */
    reference_unit_value: z.number().positive().optional(),
  })
  .strict();
export type PricingSimulationRequest = z.infer<typeof PricingSimulationRequest>;

export const PricingSimulationResponse = z.object({
  /** Preço unitário que entrega a margem desejada depois dos impostos. */
  target_price: z.number(),
  /** Menor preço sem prejuízo (margem zero). */
  break_even_price: z.number(),
  total_at_target: z.number(),
  profit_at_target: z.number(),
  within_reference: z.boolean().nullable(),
  scenarios: z.array(
    z.object({
      label: z.string(),
      margin_pct: z.number(),
      unit_price: z.number(),
      profit: z.number(),
    }),
  ),
  server_now: z.string().datetime(),
});
export type PricingSimulationResponse = z.infer<typeof PricingSimulationResponse>;

export type ProposalList = z.infer<typeof ProposalList>;
