import { z } from 'zod';

const nullishStr = z.string().nullish();

/**
 * Schema da resposta de contratações (Swagger vivo em 2026-11-03, fixtures/pncp-consulta-openapi.json).
 * Campos que a normalização exige são obrigatórios: se sumirem, a coleta vira `schema_mismatch` (e alerta),
 * sem derrubar o job. Campos extras são aceitos (passthrough) para não quebrar com acréscimos do PNCP.
 */
export const PncpOrgao = z
  .object({
    cnpj: z.string().min(1),
    razaoSocial: z.string().min(1),
    poderId: nullishStr,
    esferaId: nullishStr,
  })
  .passthrough();

export const PncpUnidade = z
  .object({
    ufSigla: nullishStr,
    ufNome: nullishStr,
    municipioNome: nullishStr,
    nomeUnidade: nullishStr,
    codigoUnidade: nullishStr,
    codigoIbge: nullishStr,
  })
  .passthrough();

export const PncpContratacao = z
  .object({
    numeroControlePNCP: z.string().min(1),
    orgaoEntidade: PncpOrgao,
    unidadeOrgao: PncpUnidade.nullish(),
    anoCompra: z.number().int(),
    sequencialCompra: z.number().int(),
    numeroCompra: nullishStr,
    processo: nullishStr,
    objetoCompra: z.string(),
    informacaoComplementar: nullishStr,
    modalidadeId: z.number().int(),
    modalidadeNome: z.string(),
    situacaoCompraId: z.union([z.number(), z.string()]).nullish(),
    situacaoCompraNome: z.string(),
    srp: z.boolean().nullish(),
    valorTotalEstimado: z.number().nullish(),
    valorTotalHomologado: z.number().nullish(),
    dataAberturaProposta: nullishStr,
    dataEncerramentoProposta: nullishStr,
    dataPublicacaoPncp: nullishStr,
    dataInclusao: nullishStr,
    dataAtualizacao: nullishStr,
    dataAtualizacaoGlobal: nullishStr,
    linkSistemaOrigem: nullishStr,
    linkProcessoEletronico: nullishStr,
  })
  .passthrough();
export type PncpContratacao = z.infer<typeof PncpContratacao>;

export const PncpPagina = z
  .object({
    data: z.array(z.unknown()),
    totalRegistros: z.number().int().nonnegative(),
    totalPaginas: z.number().int().nonnegative(),
    numeroPagina: z.number().int().nonnegative(),
    paginasRestantes: z.number().int().nonnegative().optional(),
    empty: z.boolean().optional(),
  })
  .passthrough();
export type PncpPagina = z.infer<typeof PncpPagina>;
