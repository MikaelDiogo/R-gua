# 03 — Stack, alternativas e ADRs

## 1. Stack escolhida

| Camada               | Escolha                                                               | Por quê                                                                                                                                |
| -------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Linguagem backend    | TypeScript (strict)                                                   | Contratos zod compartilhados com o front; time já usa NestJS                                                                           |
| Framework API        | NestJS sobre Fastify                                                  | Modularidade, DI, ecossistema, bom desempenho HTTP                                                                                     |
| Banco                | PostgreSQL 17+                                                        | Relacional, RLS, FTS, vetores e BM25 por extensão, uma transação                                                                       |
| BM25                 | ParadeDB `pg_search`                                                  | BM25 como índice nativo, facetas e agregações; fallback FTS nativo                                                                     |
| Vetores              | `pgvector` (`halfvec`, HNSW)                                          | Mesmo banco, filtros SQL, metade da memória do `float32`                                                                               |
| Filas                | BullMQ sobre Redis                                                    | Retries, backoff, concorrência, agendamento                                                                                            |
| Cache/limites        | Redis                                                                 | Cache de consulta, rate limit, locks                                                                                                   |
| Embeddings           | BGE-M3 via Text Embeddings Inference                                  | Aberto (MIT), multilíngue, 1024 dims, 8K tokens, suporta denso e esparso                                                               |
| Reranker             | `bge-reranker-v2-m3` via TEI                                          | Cross-encoder multilíngue, só nos top candidatos                                                                                       |
| LLM                  | Multi-provedor via porta `LlmGateway` + Vercel AI SDK nos adaptadores | Anthropic, OpenAI, Gemini, Groq, OpenRouter, Ollama e endpoints compatíveis com OpenAI; troca por configuração (`16-provedores-ia.md`) |
| Segredos             | KMS / secret manager + criptografia em envelope                       | Chaves de API de IA (plataforma e BYOK)                                                                                                |
| Processamento de PDF | Python (sidecar)                                                      | Melhor ecossistema para PDF/OCR                                                                                                        |
| Objetos              | S3-compatível                                                         | PDFs e anexos                                                                                                                          |
| Frontend             | Next.js (App Router) + cliente gerado do OpenAPI                      | SSR para páginas públicas, SPA para o app                                                                                              |
| Observabilidade      | OpenTelemetry + Prometheus/Grafana + logs estruturados                | Padrão aberto                                                                                                                          |
| Testes               | Vitest/Jest, Testcontainers, Playwright                               | Postgres real nos testes de integração                                                                                                 |

Como o desenvolvedor já trabalha com Java/Spring Boot e NestJS, Spring Boot seria uma alternativa válida para a API. Escolhemos NestJS pelo compartilhamento de tipos e schemas com o front e com saídas de LLM (zod). A arquitetura (portas e adaptadores) não depende dessa escolha.

## 2. Por que busca dentro do PostgreSQL

Comparação feita para este caso (busca por texto + filtros duros + semântica, corpus de milhões de documentos, equipe pequena):

| Opção                               | A favor                                                                                      | Contra                                                                                    | Veredito                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Postgres + pg_search + pgvector** | Uma fonte de verdade, filtros e junções em SQL, RRF em SQL, RLS e transações, menos operação | BM25 em extensão (licença e maturidade a validar), vetores consomem RAM do mesmo servidor | **Escolhido** para MVP e escala média            |
| OpenSearch / Elasticsearch          | Motor de busca completo, BM25 + kNN + RRF nativos, facetas maduras                           | Segundo sistema para operar, sincronização com o Postgres, consistência eventual, custo   | Reserva se a busca exceder o Postgres            |
| Qdrant                              | Muito bom em vetores e filtros, híbrido denso+esparso nativo                                 | Só vetores; ainda precisa do relacional; mais um sistema                                  | Reserva para o conjunto frio, se o volume exigir |
| Pinecone / SaaS vetorial            | Zero operação                                                                                | Dados fora do país, custo por leitura, ainda precisa de lexical                           | Rejeitado (LGPD, custo, lock-in)                 |

Pesquisa de apoio (ver `99-fontes.md`): guias de 2026 recomendam hybrid search (lexical + vetorial com fusão) como ponto de partida para buscas com termos exatos e siglas, que é o caso de editais (números de pregão, CATMAT, siglas de órgãos). Um comparativo de vetores observa que a maioria das equipes não precisa adicionar um banco de vetores separado. Benchmarks de ANN variam muito com dataset e configuração; **não usar números de terceiros como meta** — medir na Fase 0 com nossos dados.

## 3. ADRs

### ADR-001 — Monólito modular com workers

**Decisão:** API, worker e web como apps separados no mesmo repositório; sem microserviços.
**Consequências:** deploy simples, transações locais. Disciplina de fronteiras por portas é obrigatória (lint de dependências entre módulos).

### ADR-002 — PostgreSQL único para relacional, BM25 e vetores

**Decisão:** ver §2. **Gatilhos para revisar:** p95 de busca acima do SLO com réplica dedicada; índice HNSW do conjunto quente não cabe em RAM; reindexações bloqueando operação.
**Plano B:** OpenSearch para lexical+kNN com o Postgres como fonte de verdade e _outbox_ para sincronizar.

### ADR-003 — `pg_search` com fallback para FTS nativo

**Decisão:** BM25 via `pg_search`. O repositório mantém uma implementação alternativa com `tsvector` (`portuguese` + `unaccent`) atrás da mesma porta `LexicalRetriever`.
**Riscos:** licença da extensão (a versão comunitária é AGPL; conferir se o modelo de distribuição é compatível — ver `15-riscos-e-premissas.md`), versão do Postgres suportada. Existe também `pg_textsearch` como alternativa de BM25 em Postgres, mais jovem.

### ADR-004 — Embeddings auto-hospedados (BGE-M3)

**Decisão:** BGE-M3 em TEI. Motivos: dados de edital não saem do nosso ambiente, custo previsível em volume de reindexação, boa cobertura multilíngue, 8K tokens de contexto.
**Avaliação obrigatória:** comparar com Cohere Embed v4, Voyage e Qwen3-Embedding no conjunto de relevância próprio (`06` §9) antes de fixar. A coluna de vetor guarda `model_id` e `model_version` para permitir reindexação sem downtime.
**Observação:** embeddings derivados de dados pessoais podem ser dados pessoais; auto-hospedar simplifica a conformidade.

### ADR-005 — Fusão por RRF

**Decisão:** Reciprocal Rank Fusion (`1/(k+rank)`, k=60) em SQL. Evita normalizar scores de escalas diferentes (BM25 vs. similaridade de cosseno). Pesos por perna configuráveis e ajustados pelo conjunto de avaliação.

### ADR-006 — SSE (não WebSocket) para streaming de IA e eventos

**Decisão:** Server-Sent Events. Fluxo unidirecional servidor→cliente basta, funciona com proxies e HTTP/2, reconexão com `Last-Event-ID`. WebSocket só se surgir colaboração em tempo real bidirecional.

### ADR-007 — BullMQ + Redis para filas

**Decisão:** BullMQ. Alternativa considerada: `pg-boss` (fila no Postgres), que reduziria uma dependência; fica como opção se Redis só servisse de fila. Como também usamos Redis para cache e rate limit, mantemos BullMQ.

### ADR-008 — Python apenas para processamento de documentos

**Decisão:** sidecar `doc-processor` com contrato HTTP/fila bem definido. Nenhuma regra de negócio em Python.

### ADR-009 — LLM multi-provedor atrás de um gateway interno

**Decisão:** porta `LlmGateway` com adaptadores por provedor (Vercel AI SDK por dentro), timeout, retry, circuit breaker **por credencial**, orçamento por organização e registro de custo. Provedor, modelo e chave são dados no banco, editáveis na tela; IDs de modelo nunca em código. Usuário escolhe o perfil de IA por pesquisa dentro do que o servidor permite. Prompt caching usado quando o provedor oferece.
**Alternativa considerada:** LiteLLM como proxy separado. Unifica ainda mais provedores, mas acrescenta um serviço para operar; fica como opção atrás da mesma porta.
**Consequência:** prompts precisam ser portáveis e avaliados por perfil de modelo (`09` §10, `16` §8).

### ADR-010 — Embedding desacoplado do LLM de conversa

**Decisão:** o modelo de embedding do índice é configuração da plataforma, trocado só por reindexação planejada. A escolha de IA do usuário afeta entendimento, análise e redação, não a recuperação. Motivo: documentos e consultas precisam do mesmo espaço vetorial.

## 4. Matriz de versões (a fixar na Fase 0)

Fixar e documentar versões exatas de: Node LTS, PostgreSQL, `pgvector`, `pg_search`, TEI, NestJS, Next.js. Atualizações de `pg_search` e `pgvector` exigem rodar o conjunto de avaliação e os testes de carga.

Versões em uso desde a Etapa 0 (2026-11-03; revisar na Fase 0):

| Componente | Versão | Observação |
|---|---|---|
| Node | 24 (`.nvmrc`) | Mínimo 22 |
| pnpm | 12.16.1 | Via corepack (`packageManager`) |
| TypeScript | ~5.9 | O 7.x (port nativo) removeu `moduleResolution=node10`; reavaliar quando NestJS e o ecossistema validarem |
| PostgreSQL | 17.11 | Imagem `paradedb/paradedb:0.26.4-pg17` |
| `pg_search` | 0.26.4 | AGPL: ver `15` |
| `pgvector` | 0.8.6 | `iterative_scan` disponível (≥ 0.8) |
| NestJS / Fastify | 12.3 / 5.12 | |
| Next.js / React | 16.4 / 19.3 | |
| zod | 4.6 | |
| Biome | 2.6 | Lint e formatação |
| Vitest | 5.0 | |
| Redis | 7 | |
| TEI | `cpu-1.8` (perfil `ml`) | Tag existe no registry; modelos ainda não baixados, validar na Fase 0 |
