# 02 — Arquitetura

Reescrito na Etapa 0 (o arquivo original do pacote não veio completo). Deriva de `03-stack.md` (ADRs), `04`, `05`, `06`, `07`, `12` e `16`. Se algo aqui contradisser um ADR, vale o ADR.

## 1. Visão

Monólito modular em TypeScript, com três processos do mesmo repositório e dois serviços de apoio:

```
                   ┌────────────┐   HTTP/SSE   ┌───────────────────────┐
 navegador ──────▶ │  apps/web  │ ───────────▶ │       apps/api        │
                   │  (Next.js) │              │ NestJS + Fastify      │
                   └────────────┘              │ módulos de domínio    │
                                               └──┬─────────┬──────────┘
                                                  │ SQL     │ filas (BullMQ)
                                  ┌───────────────▼──┐   ┌──▼──────────────┐
                                  │ PostgreSQL 17     │   │      Redis      │
                                  │ pg_search+pgvector│   │ filas·cache·rl  │
                                  └───────▲───────────┘   └──▲──────────────┘
                                          │                  │
                                   ┌──────┴──────────────────┴───┐
                                   │         apps/worker         │──▶ PNCP e outras fontes
                                   │ ingestão·embeddings·alertas │──▶ LLMs (via LlmGateway)
                                   │ análises de IA·exports      │──▶ TEI (embeddings/rerank)
                                   └──────────────┬──────────────┘
                                                  │ HTTP/fila
                                         ┌────────▼────────┐
                                         │  doc-processor  │ (Python, isolado, sem rede interna)
                                         └─────────────────┘
```

- **api** atende o cliente: autentica, valida, autoriza, executa comandos e consultas (`04`). Não faz trabalho longo; enfileira.
- **worker** executa tudo que é assíncrono ou lento. Mesma base de código e mesmos módulos, outro ponto de entrada.
- **web** só chama a API; tipos vêm do cliente gerado a partir do OpenAPI (`08`).
- **doc-processor** (Python) só extrai texto de PDF/OCR e devolve chunks (ADR-008). Nenhuma regra de negócio.
- **TEI** serve BGE-M3 e o reranker (ADR-004). Opcional em dev (perfil `ml` do compose).

## 2. Estrutura do repositório

```
apps/
  api/            NestJS (Fastify). Composition root da API
  worker/         Processos BullMQ. Composition root do worker
  web/            Next.js (App Router)
  doc-processor/  Sidecar Python (PDF/OCR)
packages/
  contracts/      Schemas zod, tipos, códigos de erro. Fonte do OpenAPI e do cliente
  domain/         (a criar) regras puras: máquinas de estado, cálculo de prazo, entitlements
  search-eval/    (a criar) conjunto de avaliação de busca e runner
  ai-providers/   (a criar) adaptadores do LlmGateway e EmbeddingProvider
  config/         tsconfig/lint compartilhados
infra/
  docker/         compose, init SQL
docs/             especificações; docs/design = visual
```

Regra de dependência (verificada no CI): `contracts` e `domain` não dependem de ninguém; `apps/*` dependem de `packages/*`; `packages/*` nunca dependem de `apps/*`.

## 3. Módulos da API (monólito modular, ADR-001)

Cada módulo expõe uma **fachada pública** (`index.ts`); ninguém importa arquivos internos de outro módulo. Comunicação entre módulos é por fachada ou por evento (outbox).

| Módulo          | Responsabilidade                                                                       | Principais tabelas (`07`)                      |
| --------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `identity`      | Registro, login, sessão, MFA, recuperação                                              | `users`                                        |
| `organizations` | Organização, membros, papéis, empresas (CNPJs)                                         | `organizations`, `memberships`, `companies`    |
| `billing`       | Planos, assinatura, webhooks, `EntitlementService`, cotas                              | `subscriptions`, `usage_counters`              |
| `procurements`  | Leitura de editais, itens, documentos                                                  | tabelas públicas                               |
| `ingestion`     | Conectores de fonte, janelas, normalização, qualidade (roda no worker)                 | `ingest_raw`, `ingest_window`, `procurements`… |
| `search`        | `SearchIntent`, entendimento, pernas, RRF, rerank, facetas, buscas salvas              | `procurement_search`, `saved_searches`         |
| `pipeline`      | Kanban e máquina de estados                                                            | `pipeline_columns`, `pipeline_cards`           |
| `monitors`      | Monitores, alertas, digests                                                            | `monitors`, `alerts`                           |
| `ai`            | `LlmGateway`, roteamento, credenciais, `ai_runs`, análise, Q&A, compatibilidade, peças | `ai_*`                                         |
| `documents`     | Download, extração, chunks, embeddings de chunks                                       | `procurement_documents`, `document_chunks`     |
| `pricing`       | Benchmark e simulação                                                                  | consultas ao conjunto frio                     |
| `audit`         | `audit_log` append-only                                                                | `audit_log`                                    |
| `platform`      | Idempotência, outbox, SSE, relógio, configuração, rate limit                           | `idempotency_keys`, `outbox`                   |

## 4. Portas e adaptadores

O domínio fala com interfaces; infraestrutura implementa. Trocar uma implementação não toca o domínio.

| Porta                                   | Adaptadores previstos                                              | Referência       |
| --------------------------------------- | ------------------------------------------------------------------ | ---------------- |
| `SourceConnector`                       | `pncp`, `comprasgov`, portais privados                             | `05` §2.1        |
| `LexicalRetriever`                      | `pg_search` (BM25), FTS nativo (fallback)                          | ADR-003          |
| `VectorRetriever` / `EmbeddingProvider` | TEI (BGE-M3), OpenAI, Cohere, Voyage, Gemini                       | ADR-004, `16` §7 |
| `Reranker`                              | TEI (`bge-reranker-v2-m3`), nulo                                   | `06` §7          |
| `LlmGateway`                            | Anthropic, OpenAI, Google, Groq, OpenRouter, compatível com OpenAI | ADR-009, `16`    |
| `DocumentProcessor`                     | `doc-processor` HTTP                                               | ADR-008          |
| `ObjectStorage`                         | S3-compatível, disco local (dev)                                   | `12`             |
| `PaymentProvider`                       | a decidir (decisão aberta)                                         | `15` §3          |
| `Mailer`                                | SMTP/serviço transacional                                          | `01` RF-22       |
| `Clock`                                 | relógio do servidor UTC (testável)                                 | `04` §4          |
| `SecretsVault`                          | KMS/secret manager, envelope                                       | `16` §4          |

## 5. Fluxos principais

### 5.1 Comando (mutação)

`04` §2: autenticar → validar (zod `.strict()`) → autorizar (papel + RLS) → entitlements/cotas → regra de domínio → transação com **outbox** → responder com o estado resultante. `SET LOCAL app.org_id` no início da transação.

### 5.2 Ingestão

`worker` agenda janelas (`ingest_window`) → conector busca → grava `ingest_raw` → normaliza e faz upsert em `procurements` (hash de conteúdo) → emite `procurement.changed` na outbox → job de busca atualiza `procurement_search` e enfileira embedding → monitores avaliam só os registros novos/alterados → alertas.

### 5.3 Busca

`POST /v1/search` → validar e limitar → entendimento (regras; LLM rápido opcional) → pernas lexical e vetorial em paralelo → RRF → sinais de negócio → rerank opcional → snippets/facetas → resposta com `meta` honesto (`06`).

### 5.4 Análise/Q&A de edital

`POST /v1/ai/analyses` → checa cota → cria `ai_run` (`queued`) → worker baixa/processa documentos se preciso → map-reduce com `LlmGateway` → valida schema e citações → grava resultado → evento SSE. Q&A responde em SSE com recuperação restrita ao edital (`06` §10, `09`).

## 6. Dados e tenancy

Duas famílias de tabelas: públicas (sem RLS, escritas só pelo worker) e de tenant (RLS por `org_id`, `FORCE ROW LEVEL SECURITY`). Papéis de banco separados: `app` (sem `BYPASSRLS`, não é dono), `migrator` e `worker_maint`. PgBouncer em modo transação; só `SET LOCAL`. Detalhes em `07` e `10`.

## 7. Filas (BullMQ, ADR-007)

`ingest`, `search-index`, `embeddings`, `documents`, `ai-runs`, `alerts`, `exports`, `maintenance` (fecha `is_open` a cada 5 min, retenção). Cada job é idempotente e carrega `request_id`. Profundidade e idade do job mais antigo são métricas (`11`).

## 8. Tempo real

Um canal SSE por usuário/organização (`GET /v1/events`) com eventos versionados e `Last-Event-ID` (ADR-006, `08` §4). O estado vivo fica no banco; o SSE é aviso, não fonte de verdade.

## 9. Observabilidade e erros

OpenTelemetry em api, worker e sidecar; `request_id` em tudo; erros `application/problem+json` com `code` estável (`08` §1–2, `11`).

## 10. Decisões que travam o desenho

| Decisão                                              | Efeito                                                         | Status          |
| ---------------------------------------------------- | -------------------------------------------------------------- | --------------- |
| Onde roda o Postgres (gerenciado × VM com ParadeDB)  | Define se `pg_search` é viável                                 | aberta (Fase 0) |
| Licença AGPL do `pg_search` × modelo de distribuição | Pode forçar o fallback FTS                                     | aberta          |
| Provedor de nuvem e de pagamento                     | Adaptadores `ObjectStorage`, `SecretsVault`, `PaymentProvider` | aberta          |
| SaaS apenas × também self-hosted                     | Suporte a Ollama local, licença                                | aberta          |

Enquanto abertas, o código só usa as portas; nenhuma classe de domínio importa SDK de fornecedor.
