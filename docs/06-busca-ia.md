# 06 — Busca com IA (híbrida + RAG)

Objetivo: resultados relevantes em poucas centenas de milissegundos, com filtros exatos, entendimento de linguagem natural e explicação do porquê de cada resultado. Todos os números de latência aqui são **metas** a validar na Fase 0.

## 1. Visão do pipeline

```
SearchIntent ─▶ validar/limitar ─▶ entendimento da consulta ─▶ ┬─ perna lexical (BM25) ──┐
                                                                ├─ perna vetorial (HNSW) ─┼─▶ RRF ─▶ rerank* ─▶ snippets + facetas ─▶ resposta
                                                                └─ (ids exatos: nº controle) ┘
                  (* rerank opcional por plano/carga)             filtros duros idênticos em todas as pernas
```

Por que híbrido: busca lexical acerta termos exatos, números de pregão, siglas e códigos CATMAT, comuns em editais; busca vetorial acerta sinônimos e descrições incompletas ("notebook" vs "microcomputador portátil"). Usar só uma das duas perde resultados. Fusão por posição (RRF) evita misturar scores de escalas diferentes.

## 2. `SearchIntent` (o que o cliente envia)

```ts
const SearchIntent = z
  .object({
    q: z.string().max(500).optional(), // texto livre
    mode: z.enum(['hybrid', 'lexical']).default('hybrid'),
    filters: z
      .object({
        uf: z.array(UF).max(27).optional(),
        municipality_ibge: z.array(z.string()).max(50).optional(),
        modality: z.array(ModalityCode).max(13).optional(),
        status: z.array(ProcurementStatus).optional(), // ex.: open_for_proposals
        value: z
          .object({ min: z.number().nonnegative().optional(), max: z.number().optional() })
          .optional(),
        proposals_deadline: z
          .object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() })
          .optional(),
        published: z
          .object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() })
          .optional(),
        organ_cnpj: z.array(z.string()).max(50).optional(),
        sphere: z.array(z.enum(['federal', 'state', 'municipal'])).optional(),
        cnae_hint: z.array(z.string()).max(20).optional(),
      })
      .default({}),
    sort: z
      .enum(['relevance', 'deadline_asc', 'published_desc', 'value_desc'])
      .default('relevance'),
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(20),
    facets: z
      .array(z.enum(['uf', 'modality', 'value_band', 'status', 'sphere']))
      .max(5)
      .default([]),
    profile_id: z.string().uuid().optional(), // aplica perfil da empresa (boost), resolvido no servidor
    ai_profile_id: z.string().uuid().optional(), // IA escolhida para entendimento/resumo (ver 16-provedores-ia.md)
  })
  .strict();
```

O servidor **nunca** aceita SQL, nomes de colunas, pesos ou nome de modelo vindos do cliente. Limites (tamanho de `q`, número de valores, profundidade de paginação) são aplicados antes de qualquer consulta.

## 3. Entendimento da consulta

Em camadas, da mais barata à mais cara, cada uma com orçamento de tempo:

1. **Normalização:** minúsculas, remoção de acentos para a perna lexical, tratamento de números de pregão (`045/2024`), CNPJ e códigos CATMAT/CATSER detectados por regex → viram filtro ou busca exata.
2. **Dicionário do domínio:** sinônimos e siglas (ex.: "TI" ↔ "tecnologia da informação", "RP" ↔ "registro de preços", "PE" ↔ "pregão eletrônico"). Versionado e avaliado pelo conjunto de relevância.
3. **Correção ortográfica** leve (trigramas sobre vocabulário do corpus).
4. **Linguagem natural → filtros (P2):** o modelo da função _Rápido_ (qualquer provedor configurado, ou o escolhido pelo usuário) converte "pregões de TI em CE acima de 200 mil abrindo esta semana" em `SearchIntent` estruturado, com saída validada por schema. Cache por consulta normalizada; timeout curto (meta ≈ 800 ms); se falhar, a busca segue com a consulta literal e `meta.degraded` informa.
5. **Expansão semântica** não é feita por LLM na busca; a perna vetorial já cobre sinônimos.

## 4. Documento de busca (indexação)

Um registro de busca por contratação (`procurement_search`), montado na ingestão:

- **Texto lexical:** objeto + descrição + nome do órgão + itens (descrições concatenadas, com teto) + número do processo.
- **Colunas de filtro:** UF, município (IBGE), modalidade, situação, esfera, valor estimado, datas (publicação, abertura, limite de propostas), CNPJ do órgão, `quality_flags`, `is_open` (derivado).
- **Vetor:** embedding de um **texto-resumo canônico** (objeto + categoria + principais itens), não do edital inteiro, para manter custo e ruído baixos. Texto longo do edital entra só no RAG (§10).
- **Contexto de chunk:** ao embutir trechos (RAG), antepor um breve contexto do documento (órgão, modalidade, objeto, seção). O estudo da Anthropic sobre _Contextual Retrieval_ reporta redução de 49% na taxa de falhas de recuperação com embeddings + BM25 contextuais, e 67% somando reranker (resultado do estudo original; validar no nosso corpus).

Dois níveis de dados:

| Conjunto   | Definição                                                                                 | Índices                                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Quente** | Abertos para propostas ou publicados/atualizados nos últimos N dias (N a definir, ex. 90) | BM25 + HNSW parcial (`WHERE is_hot`, onde `is_hot` é mantido pelo mesmo job de `is_open` (predicado de índice parcial não pode usar `now()`)) mantido em RAM |
| **Frio**   | Histórico                                                                                 | BM25 + HNSW separado (ou IVFFlat/menor `ef`) para precificador e jurisprudência; consultas ao frio têm orçamento próprio                                     |

Buscas padrão consultam só o quente; "incluir histórico" é opt-in e sujeito ao plano.

## 5. Perna lexical

- `pg_search` (BM25) sobre o texto lexical, analisador `portuguese` (stemming, stopwords) + `unaccent`; busca por frase e proximidade para exatidão; boost maior para campo "objeto" e "número".
- Fallback: `tsvector` com `websearch_to_tsquery('portuguese', ...)` e `ts_rank_cd` (porta `LexicalRetriever`).
- Retorna top `K_lex` (ex.: 200) já filtrado.

## 6. Perna vetorial

- Embedding da consulta via TEI (BGE-M3, 1024 dims), com cache por consulta normalizada. Meta de latência do embedding de consulta: dezenas de ms em GPU/CPU adequada (validar).
- `halfvec(1024)` + índice HNSW (`vector_cosine_ops`). Parâmetros iniciais: `m=16`, `ef_construction=128`, `hnsw.ef_search` ajustado por carga; **medir recall × latência** no nosso dataset.
- **Filtro + ANN:** em Postgres, filtro seletivo sobre HNSW pode devolver menos que K resultados. Mitigações: índice parcial para o conjunto quente; `hnsw.iterative_scan` (pgvector ≥ 0.8) para filtros seletivos; particionamento por UF/ano se necessário; para filtros muito seletivos, trocar para varredura exata no subconjunto (já pequeno).
- Retorna top `K_vec` (ex.: 200).

## 7. Fusão e rerank

RRF em SQL, com pesos por perna:

```sql
WITH lex AS (
  SELECT id, row_number() OVER (ORDER BY score DESC) AS r
  FROM lexical_candidates            -- top K_lex, já com filtros duros
), vec AS (
  SELECT id, row_number() OVER (ORDER BY dist ASC) AS r
  FROM vector_candidates             -- top K_vec, mesmos filtros duros
)
SELECT id,
       COALESCE(:w_lex / (60 + lex.r), 0) + COALESCE(:w_vec / (60 + vec.r), 0) AS rrf
FROM lex FULL OUTER JOIN vec USING (id)
ORDER BY rrf DESC
LIMIT :n_rerank;
```

- **Sinais de negócio** (pós-fusão, pequenos e transparentes): boost para prazo próximo e aberto, boost por compatibilidade com o perfil da empresa, penalização por `quality_flags` graves. Cada sinal aparece em `explain`.
- **Rerank (opcional):** cross-encoder `bge-reranker-v2-m3` nos top 30–50 candidatos fundidos. Ativado por plano/carga; se estourar o orçamento de tempo, devolve a ordem do RRF com `meta.degraded=['rerank']`.
- Ordenações por prazo/valor/data aplicam o filtro e a ordenação em SQL; a relevância vira critério de desempate.

## 8. Consumo da pesquisa (o que o cliente recebe)

- **Paginação por cursor** (keyset): `cursor` codifica a posição estável (score + id, ou chave de ordenação). Sem `OFFSET`. Profundidade máxima configurável (ex.: 500 resultados) por plano.
- **Resultado enriquecido por item:** id, título/objeto, órgão, UF/município, modalidade, valor estimado, datas e `server_now`, `highlights` (trechos com marcação de termos), `match` (`lexical|semantic|both`), `explain` (sinais que contribuíram).
- **Facetas** (contagens por UF, modalidade, faixa de valor, status) calculadas no conjunto filtrado, com teto de custo; aproximadas quando o conjunto é grande (`meta.facets_approx=true`).
- **Meta de honestidade:** `meta` inclui `total_estimate` (com marca de exata/aproximada), pernas usadas, degradações, `index_freshness_at`. Resultado vazio só quando as pernas responderam `ok`.
- **Streaming:** a busca em si é uma resposta única e rápida. Streaming (SSE) é reservado para respostas geradas por LLM (resumo dos resultados, Q&A, análise).
- **Buscas salvas / monitores** reutilizam o mesmo `SearchIntent` persistido.
- **Prefetch de detalhe:** a lista traz o mínimo para decidir; o detalhe do edital é carregado sob demanda (e pré-aquecido ao passar o mouse, a critério do design).

## 9. Avaliação (conjunto de relevância e _gates_)

Nenhuma mudança no pipeline de busca (analisador, pesos, modelo de embedding, índice, dicionário, rerank) é mesclada sem passar por avaliação offline.

- **Conjunto de avaliação (`packages/search-eval`):** 200–500 consultas reais ou plausíveis (curtas, longas, com sigla, com número, em linguagem natural) com julgamentos de relevância graduados (0–3) sobre os resultados. Fontes: especialistas de licitações, logs anonimizados (depois do MVP), e consultas sintéticas geradas por LLM **revisadas por humano**.
- **Métricas:** `nDCG@10`, `recall@50` (antes do rerank), `MRR`, taxa de "zero resultados", cobertura de filtros.
- **Comparações obrigatórias:** lexical puro vs. vetorial puro vs. híbrido; com e sem rerank; BGE-M3 vs. alternativas de embedding; pesos RRF.
- **Gate de merge:** a mudança não pode piorar `nDCG@10` além de uma tolerância definida (ex.: −1%) nem `recall@50`; precisa passar também no teste de latência (§11).
- **Avaliação online (pós-MVP):** cliques, salvamentos em favoritos/Kanban, polegar para cima/baixo, tempo até a primeira ação; experimentos A/B com _feature flags_.
- **Regressão de dados:** o mesmo conjunto roda após cada reindexação ou troca de versão de `pg_search`/`pgvector`.

## 10. RAG sobre editais ("pergunte ao edital")

1. **Preparação:** documento → texto por página/seção → chunks de 300–800 tokens com sobreposição pequena, respeitando estrutura (cláusulas, tabelas). Cada chunk guarda `page`, `section`, `doc_id`, contexto antecipado (§4).
2. **Recuperação:** híbrida (BM25 + vetor) **restrita ao edital em questão**; top 8–12 após RRF e rerank.
3. **Geração:** prompt com instruções do sistema fixas (cacheáveis), trechos recuperados **delimitados como dados não confiáveis**, pergunta do usuário. O modelo responde em streaming com citações `[chunk_id]`.
4. **Validação de citação:** o servidor verifica que todo `chunk_id` citado existe no contexto enviado e descarta/sinaliza afirmações sem citação. Sem trecho de suporte, a resposta deve dizer que o edital não traz a informação.
5. **Escopo:** perguntas só sobre editais a que o usuário tem direito (cota do plano) e nunca misturam editais de outros contextos sem pedido explícito.

## 11. Performance (metas iniciais — validar)

| Etapa                               | Meta p95 (estimativa)              |
| ----------------------------------- | ---------------------------------- |
| Validação + entendimento por regras | < 10 ms                            |
| Embedding da consulta (com cache)   | < 60 ms                            |
| Perna lexical (quente)              | < 60 ms                            |
| Perna vetorial (quente)             | < 80 ms, em paralelo com a lexical |
| Fusão + sinais                      | < 15 ms                            |
| Rerank (opcional, 40 candidatos)    | < 150 ms                           |
| Snippets + facetas                  | < 60 ms                            |
| **Total sem rerank**                | **< 300 ms**                       |
| **Total com rerank**                | **< 500 ms**                       |

Táticas: pernas em paralelo; `prepared statements`; pool de conexões dimensionado (PgBouncer em modo transação); cache de resultado por `hash(SearchIntent normalizado + escopo)` com TTL curto e invalidação por evento de ingestão; cache de embedding de consulta; índices quentes residentes em RAM (`shared_buffers`/cache do SO) com monitoração do tamanho do índice HNSW; réplica de leitura para busca quando necessário.

## 12. Degradação controlada

| Falha                            | Comportamento                                                          |
| -------------------------------- | ---------------------------------------------------------------------- |
| TEI (embeddings) indisponível    | Só lexical; `meta.degraded=['semantic']`                               |
| Reranker indisponível/lento      | Ordem do RRF; `degraded=['rerank']`                                    |
| LLM de entendimento indisponível | Consulta literal; `degraded=['nl_understanding']`                      |
| `pg_search` indisponível         | Fallback FTS nativo                                                    |
| Redis indisponível               | Sem cache/limites distribuídos; limite local conservador               |
| Ingestão atrasada                | `index_freshness_at` visível; aviso na UI se defasagem acima do limiar |
