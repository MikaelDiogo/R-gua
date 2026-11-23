# 05 — Ingestão de dados (PNCP)

## 1. Por que ingerir tudo

A API de consulta do PNCP **não é um motor de busca**. Medições de terceiros (04/10/2026) mostram que ela aceita `palavraChave` e `niFornecedor` e **os ignora sem avisar**, devolvendo resultados de qualquer assunto. Portanto: coletar por janela de data e modalidade, guardar tudo, e buscar no nosso índice. Esse comportamento não é documentado e pode mudar; o conector deve detectá-lo (ver §8).

## 2. Fontes

| Fonte                                                                          | Uso                                                                           | Fase                                                                       |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| PNCP — API de consulta (`https://pncp.gov.br/api/consulta`)                    | Contratações, propostas abertas, contratos, atas, PCA                         | MVP                                                                        |
| PNCP — arquivos de dados abertos                                               | Carga inicial histórica, se cobrirem o período necessário (validar na Fase 0) | MVP                                                                        |
| Documentos do edital (links do PNCP / portal de origem)                        | Texto para leitor de edital e RAG                                             | P2                                                                         |
| Compras.gov.br — dados abertos                                                 | Cobertura federal adicional e itens/CATMAT                                    | P2                                                                         |
| Portal da Transparência (CEIS/CNEP)                                            | Sanções de fornecedores                                                       | P3                                                                         |
| Portais privados (Licitanet, BLL Compras, Licitações-e/Banco do Brasil, Caixa) | Cobertura adicional e detalhes de sessão                                      | P3, um conector por portal, sujeito a termos de uso e a API/feeds oficiais |
| Diários oficiais estaduais/municipais                                          | Cauda longa (municípios fora do PNCP)                                         | P4                                                                         |

O site de referência diz monitorar PNCP, Compras.gov.br, Licitanet, BLL, Banco do Brasil e Caixa. Muitas contratações desses portais chegam ao PNCP por integração, mas não todas e nem sempre no mesmo tempo, por isso os portais entram como conectores adicionais.

### 2.1 Contrato de conector de fonte

Toda fonte implementa a mesma porta, para adicionar portais sem mexer no núcleo:

```ts
interface SourceConnector {
  id: string; // 'pncp' | 'comprasgov' | 'licitanet' | ...
  listWindows(since: Date): AsyncIterable<IngestWindow>;
  fetch(window: IngestWindow): Promise<SourceFetchResult>; // status explícito: ok | empty | rate_limited | upstream_error | schema_mismatch
  normalize(raw: unknown): NormalizedProcurement[]; // para o modelo canônico
  matchKeys(p: NormalizedProcurement): string[]; // chaves para deduplicar entre fontes
}
```

**Deduplicação entre fontes:** a mesma licitação pode aparecer no PNCP e no portal de origem. A chave principal é o `numeroControlePNCP` quando existir; senão, a combinação CNPJ do órgão + número do processo/edital + modalidade + ano. O registro canônico guarda `sources[]` com o link de cada origem; o PNCP prevalece em campos conflitantes, salvo regra explícita por campo.

## 3. Fatos operacionais da API (a confirmar no Swagger na Fase 0)

- Swagger: `https://pncp.gov.br/api/consulta/swagger-ui/index.html`.
- `204` sem corpo = "nenhum registro" (resposta válida).
- `429` pode vir em **HTML**, não JSON, sem informar o limite; após cerca de 15 chamadas em rajada. Adotar teto conservador (referência de terceiros: ~12 chamadas/min por instância) e configurável.
- `modalidade` é obrigatória em `/contratacoes/publicacao` e `/contratacoes/atualizacao` (códigos 1 a 13), logo varre-se uma modalidade por chamada (ver §3.1: em `/proposta` ela é opcional).
- `tamanhoPagina` tem tetos diferentes por endpoint (10–50 em contratações, até 500 em contratos). Usar o menor teto seguro e descobrir na Fase 0.
- Contratos exigem CNPJ do órgão; não existe consulta por fornecedor.
- O manual de integração e a documentação têm inconsistências conhecidas (relatório da Transparência Brasil). **O Swagger vivo e fixtures gravadas valem mais que o PDF do manual.**

### 3.1 Confirmado na Fase 0 (Swagger vivo e chamadas reais, 2026-11-03)

Fixtures em `packages/ingestion/fixtures/`; testes em `packages/ingestion/src/pncp/`.

| Fato | Evidência |
|---|---|
| `palavraChave` é **ignorada** em silêncio: a mesma janela devolve o mesmo total (31) e os mesmos bytes com e sem uma palavra improvável | Duas chamadas reais; o detector (`detectIgnoredFilter`) repete o teste |
| `tamanhoPagina` máximo é **50** em contratações (10 a 50); 100 devolve `400 "Tamanho de página inválido"`. Contratos, atas e PCA aceitam até 500 | Swagger + chamada |
| `/contratacoes/proposta` aceita **omitir** a modalidade (o Swagger a marca opcional). `/publicacao` e `/atualizacao` exigem | Swagger + chamada sem modalidade devolveu 200 |
| Existe `/contratacoes/atualizacao` (por data de atualização global): serve de incremental sem reler janelas por publicação | Swagger |
| Datas de consulta no formato `yyyyMMdd`; `2026-11-01` devolve `422 "Data Inicial inválida, deve estar no formato yyyyMMdd."` | Chamada |
| Janela sem registros devolve `204` sem corpo (modalidades 12 e 13 em 01/11/2026) | Chamada |
| Datas da resposta vêm **sem fuso**, em horário de Brasília (UTC-3, sem horário de verão desde 2019) | Cabeçalho de erro com `-03:00` |
| Resposta paginada: `{data, totalRegistros, totalPaginas, numeroPagina, paginasRestantes, empty}` | Fixtures |
| `esferaId` também traz `N` (não se aplica), além de F, E e M | Fixtures |
| Em 30 registros reais, 5 tinham `valorTotalEstimado <= 0` e 1 objeto continha um número de 11 dígitos que **não** é CPF (emenda parlamentar). O mascaramento só age com CPF formatado ou rotulado | Fixtures e testes |
| Propostas abertas em 03/11/2026: 16.804 só de Pregão Eletrônico (`dataFinal=20261231`); 27.731 sem filtro de modalidade com `dataFinal=20261231`; 33.646 sem modalidade com `dataFinal` +365 dias. O total depende da `dataFinal` | `/proposta` (3 chamadas) |

Erros 429 não foram provocados de propósito: o tratamento está coberto por testes com respostas simuladas. O limite real de rajada segue desconhecido.

## 4. Pipeline em camadas

```
PNCP ──▶ RAW (jsonb + metadados da coleta) ──▶ CURATED (tabelas normalizadas) ──▶ SEARCH (documento de busca + vetores)
          imutável, reprocessável             validada, deduplicada               derivada, reconstruível
```

- **RAW:** `ingest_raw(source, endpoint, params_hash, fetched_at, http_status, body jsonb)`. Permite reprocessar sem chamar o PNCP de novo.
- **CURATED:** `procurements`, `procurement_items`, `procurement_documents`, `contracts` (ver `07`).
- **SEARCH:** `procurement_search` (texto consolidado, colunas de filtro, tsvector/BM25) e `procurement_embeddings`.

## 5. Estratégias de coleta

1. **Backfill histórico** (uma vez): janelas de 1–7 dias × 13 modalidades × paginação, em fila, retomável, começando pelo período mais recente.
2. **Incremental** (contínuo): a cada N minutos, por _data de atualização_ quando o endpoint suportar; senão por data de publicação com sobreposição de segurança (ex.: reler as últimas 48 h).
3. **Propostas abertas** (alta frequência): conjunto "quente" — editais com recebimento de propostas aberto — consultado com mais frequência, pois é o que gera alertas.
4. **Reconciliação** (diária): compara contagens por dia/modalidade com a base local e reenfileira janelas com divergência.

Cada janela é uma unidade idempotente com `ingest_window(state: pending|running|ok|partial|failed, attempts, last_error)`.

## 6. Normalização e validação

Defensiva, porque os dados têm problemas conhecidos (datas irreais, status desatualizado, descrições sem padrão, estimativas de preço mal preenchidas):

| Campo                               | Regra                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Identidade                          | `numeroControlePNCP` é a chave natural; compor/validar o formato                                                                         |
| Datas                               | Converter para UTC; rejeitar ou marcar `date_suspect` valores fora de faixa plausível (ex.: ano < 2021 ou > hoje+5 anos para publicação) |
| Valores                             | Decimal; `null` quando ausente; sinalizar `value_suspect` para zero, negativo ou ordem de grandeza absurda                               |
| Modalidade, situação, esfera, poder | Mapear códigos para enums internos via tabelas de domínio versionadas                                                                    |
| UF/município                        | Normalizar com tabela IBGE                                                                                                               |
| Texto do objeto                     | Limpar espaços, normalizar caixa para exibição, preservar original em `object_raw`                                                       |
| Órgão                               | Chave por CNPJ do órgão + unidade; manter nome oficial e variações                                                                       |

Resultado: `quality_flags text[]` por registro. A busca pode penalizar ou filtrar registros com flags graves; a UI pode mostrar aviso.

## 7. Deduplicação e atualização

- _Upsert_ por `numero_controle_pncp`.
- `content_hash` sobre os campos que afetam busca e IA. Se o hash não mudou, não reenfileira embedding nem reprocessa documento.
- Mudanças relevantes (prazo, situação, valor, retificação) geram linha em `procurement_changes` e evento `procurement.changed` para os alertas.

## 8. Resiliência e honestidade de status

- Timeout, retry com backoff exponencial e jitter, circuit breaker por endpoint.
- **Status por fonte em toda coleta**: `ok | empty | rate_limited | upstream_error | schema_mismatch`. **`empty` só quando houve `200/204` válido.** `429` ou erro nunca vira "nenhum resultado".
- **Detector de filtro ignorado:** teste sintético diário chama o endpoint com um filtro de palavra improvável; se voltar resultado, a premissa mudou (ou continua ignorando) e o alerta interno é registrado. Se um dia o filtro passar a funcionar, avaliar uso como otimização, nunca como substituto do índice.
- Validação de schema da resposta (zod); campo novo ou ausente gera `schema_mismatch` e alerta, sem derrubar o job.
- Fixtures gravadas de respostas reais para testes de contrato.

## 9. Documentos do edital

1. Para editais abertos relevantes (ou sob demanda do usuário), baixar documentos listados (apenas hosts permitidos; limite de tamanho; verificação de tipo).
2. `doc-processor` extrai texto (PDF nativo; OCR só se necessário), preserva páginas e estrutura (títulos, tabelas), gera chunks com metadados (`page`, `section`).
3. Guardar o arquivo no armazenamento de objetos e o texto/chunks no banco. Guardar hash do arquivo para evitar reprocessamento.
4. Tratar o conteúdo como **não confiável** (`10`).

## 10. LGPD na ingestão

- O endpoint de contratos traz CPF e nome de **pessoa física** como fornecedor. Regra: descartar o registro do índice de busca e apenas contar (`omitidos_pessoa_fisica`), ou manter só os campos não pessoais.
- CPF dentro de texto livre (objeto, justificativa) é mascarado na ingestão (`[CPF omitido]`).
- Fornecedor que pode ser MEI ou empresário individual (nome de pessoa na razão social): omitir nome e marcar `supplier_name_omitted_lgpd`.
- Base legal e finalidade documentadas em `10-seguranca-lgpd.md`.

## 11. Volume e capacidade (estimativa — medir na Fase 0)

Um relatório do TCU/Atricon contou 873.887 contratações bem-sucedidas no módulo de editais/avisos entre ago/2021 e jun/2024. Use isso apenas como ordem de grandeza. Na Fase 0, medir: contratações/dia por modalidade, tamanho médio do texto, itens por contratação, % com documentos e, daí, projetar armazenamento, número de vetores e tempo de backfill sob o rate limit.
