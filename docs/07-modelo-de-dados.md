# 07 — Modelo de dados (PostgreSQL)

Esquema de referência. Nomes e tipos são o ponto de partida para as migrations; ajustar na Fase 0 conforme medições. Convenções: `snake_case`, `id uuid` (UUIDv7 para novas linhas), `created_at/updated_at timestamptz` em UTC, `version int` para controle otimista nas entidades de tenant.

## 1. Duas famílias de tabelas

| Família                                        | Exemplos                                                                                                                  | RLS                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Pública** (dados do PNCP, iguais para todos) | `procurements`, `procurement_items`, `procurement_documents`, `procurement_search`, `procurement_embeddings`, `contracts` | Não (leitura aberta ao app; escrita só pelo worker) |
| **Tenant** (dados da organização)              | `pipeline_cards`, `saved_searches`, `monitors`, `ai_runs`, `company_profiles`, `favorites`…                               | **Sim**, por `org_id`                               |

## 2. Extensões

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;       -- pgvector
CREATE EXTENSION IF NOT EXISTS pg_search;    -- ParadeDB (ver ADR-003)
```

## 3. Dados públicos

```sql
CREATE TABLE ingest_raw (
  id            bigserial PRIMARY KEY,
  source        text NOT NULL,
  endpoint      text NOT NULL,
  params_hash   text NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  http_status   int NOT NULL,
  status        text NOT NULL,              -- ok | empty | rate_limited | upstream_error | schema_mismatch
  body          jsonb
);

CREATE TABLE ingest_window (
  id            uuid PRIMARY KEY,
  endpoint      text NOT NULL,
  modality      smallint,
  window_start  timestamptz NOT NULL,
  window_end    timestamptz NOT NULL,
  state         text NOT NULL,              -- pending | running | ok | partial | failed
  attempts      int NOT NULL DEFAULT 0,
  last_error    text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint, modality, window_start, window_end)
);

CREATE TABLE organs (
  cnpj          text PRIMARY KEY,
  name          text NOT NULL,
  sphere        text,                       -- federal | state | municipal
  power         text,
  uf            char(2),
  municipality_ibge text
);

CREATE TABLE procurements (
  id                    uuid PRIMARY KEY,
  numero_controle_pncp  text NOT NULL UNIQUE,
  organ_cnpj            text NOT NULL REFERENCES organs(cnpj),
  process_number        text,
  edital_number         text,
  modality              smallint NOT NULL,
  status                text NOT NULL,
  object_text           text NOT NULL,       -- normalizado
  object_raw            text,
  estimated_value       numeric(18,2),
  uf                    char(2),
  municipality_ibge     text,
  published_at          timestamptz,
  proposals_open_at     timestamptz,
  proposals_close_at    timestamptz,
  session_at            timestamptz,
  pncp_updated_at       timestamptz,
  is_open               boolean NOT NULL DEFAULT false,  -- mantido pela ingestão + job a cada 5 min (ver nota)
  quality_flags         text[] NOT NULL DEFAULT '{}',
  content_hash          text NOT NULL,
  source_url            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
-- Nota: `is_open` não pode ser coluna gerada (now() não é imutável). A ingestão grava o valor
-- e um job fecha os vencidos: UPDATE ... SET is_open = false WHERE is_open AND proposals_close_at <= now().
-- A busca sempre reaplica `proposals_close_at > now()` no filtro, então um atraso do job nunca mostra edital fechado como aberto.
-- O mesmo vale para o índice parcial do conjunto quente: o predicado usa `is_open` (coluna), não now().

CREATE INDEX procurements_filters_idx ON procurements (uf, modality, status, proposals_close_at);
CREATE INDEX procurements_published_idx ON procurements (published_at DESC);
CREATE INDEX procurements_organ_idx ON procurements (organ_cnpj);

CREATE TABLE procurement_items (
  id              uuid PRIMARY KEY,
  procurement_id  uuid NOT NULL REFERENCES procurements(id) ON DELETE CASCADE,
  item_number     int NOT NULL,
  description     text NOT NULL,
  quantity        numeric(18,4),
  unit            text,
  unit_value      numeric(18,4),
  catmat_code     text,
  UNIQUE (procurement_id, item_number)
);

CREATE TABLE procurement_changes (
  id              bigserial PRIMARY KEY,
  procurement_id  uuid NOT NULL REFERENCES procurements(id) ON DELETE CASCADE,
  changed_at      timestamptz NOT NULL DEFAULT now(),
  fields          text[] NOT NULL,
  before          jsonb,
  after           jsonb
);

CREATE TABLE procurement_documents (
  id              uuid PRIMARY KEY,
  procurement_id  uuid NOT NULL REFERENCES procurements(id) ON DELETE CASCADE,
  kind            text NOT NULL,             -- edital | termo_referencia | anexo | ata | outro
  source_url      text NOT NULL,
  storage_key     text,
  file_hash       text,
  pages           int,
  text_status     text NOT NULL DEFAULT 'pending', -- pending | ok | ocr | failed
  processed_at    timestamptz
);

CREATE TABLE document_chunks (
  id              uuid PRIMARY KEY,
  document_id     uuid NOT NULL REFERENCES procurement_documents(id) ON DELETE CASCADE,
  procurement_id  uuid NOT NULL REFERENCES procurements(id) ON DELETE CASCADE,
  ordinal         int NOT NULL,
  page_from       int,
  page_to         int,
  section         text,
  content         text NOT NULL,
  context_prefix  text,                      -- contexto antecipado (contextual retrieval)
  embedding       halfvec(1024),
  embedding_model text,
  UNIQUE (document_id, ordinal)
);
-- HNSW e BM25 sobre document_chunks (filtro por procurement_id na consulta)
CREATE INDEX document_chunks_hnsw ON document_chunks USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 128);

CREATE TABLE contracts (
  id               uuid PRIMARY KEY,
  numero_controle_pncp text NOT NULL UNIQUE,
  procurement_id   uuid REFERENCES procurements(id),
  organ_cnpj       text NOT NULL REFERENCES organs(cnpj),
  supplier_cnpj    text,                      -- NULL se pessoa física (LGPD)
  supplier_name    text,                      -- NULL se omitido por LGPD
  supplier_name_omitted_lgpd boolean NOT NULL DEFAULT false,
  object_text      text,
  value            numeric(18,2),
  signed_at        date,
  valid_until      date
);
```

## 4. Índices de busca

```sql
CREATE TABLE procurement_search (
  procurement_id  uuid PRIMARY KEY REFERENCES procurements(id) ON DELETE CASCADE,
  lexical_text    text NOT NULL,              -- objeto + órgão + itens (com teto)
  summary_text    text NOT NULL,              -- texto canônico que vira embedding
  embedding       halfvec(1024),
  embedding_model text,
  embedding_version int,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- BM25 (ParadeDB): sintaxe a conferir na versão fixada na Fase 0
-- CREATE INDEX procurement_search_bm25 ON procurement_search
--   USING bm25 (procurement_id, lexical_text) WITH (key_field = 'procurement_id');

-- Fallback FTS nativo
ALTER TABLE procurement_search ADD COLUMN tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('portuguese', unaccent(lexical_text))) STORED;
CREATE INDEX procurement_search_tsv_idx ON procurement_search USING gin (tsv);

-- Vetor do conjunto quente (índice parcial; o predicado deve ser imutável, ver nota em §3)
CREATE INDEX procurement_search_hnsw_hot ON procurement_search
  USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 128);
```

## 5. Identidade, organizações e planos

```sql
CREATE TABLE users (
  id            uuid PRIMARY KEY,
  email         citext NOT NULL UNIQUE,
  password_hash text,                         -- argon2id; NULL se SSO
  name          text,
  mfa_enabled   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
  id            uuid PRIMARY KEY,
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE subscriptions (
  org_id        uuid PRIMARY KEY REFERENCES organizations(id),
  plan          text NOT NULL CHECK (plan IN ('trial','basic','middle','advanced')),
  state         text NOT NULL CHECK (state IN ('trial','active','past_due','canceled')),
  period        text,                         -- monthly | quarterly | semiannual | annual
  current_period_end timestamptz,
  provider_ref  text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE usage_counters (
  org_id        uuid NOT NULL REFERENCES organizations(id),
  metric        text NOT NULL,                -- ai_analyses | ai_messages | exports | ...
  period_start  date NOT NULL,
  used          int NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, metric, period_start)
);

CREATE TABLE companies (                      -- multiempresa (CNPJs sob uma org)
  id            uuid PRIMARY KEY,
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cnpj          text NOT NULL,
  legal_name    text NOT NULL,
  profile       jsonb NOT NULL DEFAULT '{}',  -- segmentos, UFs, faixa de valor, certidões
  UNIQUE (org_id, cnpj)
);
```

## 6. Dados de tenant

```sql
CREATE TABLE pipeline_columns (
  id        uuid PRIMARY KEY,
  org_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key       text NOT NULL,                    -- estado canônico da máquina de estados
  label     text NOT NULL,
  position  int NOT NULL,
  UNIQUE (org_id, key)
);

CREATE TABLE pipeline_cards (
  id              uuid PRIMARY KEY,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id      uuid REFERENCES companies(id),
  procurement_id  uuid NOT NULL REFERENCES procurements(id),
  state           text NOT NULL,
  assignee_id     uuid REFERENCES users(id),
  notes           text,
  version         int NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, company_id, procurement_id)
);

CREATE TABLE saved_searches (
  id          uuid PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by  uuid NOT NULL REFERENCES users(id),
  name        text NOT NULL,
  intent      jsonb NOT NULL,                 -- SearchIntent validado
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE monitors (
  id          uuid PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id  uuid REFERENCES companies(id),
  saved_search_id uuid NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  channels    text[] NOT NULL DEFAULT '{email}',
  active      boolean NOT NULL DEFAULT true,
  last_run_at timestamptz
);

CREATE TABLE alerts (
  id            uuid PRIMARY KEY,
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  monitor_id    uuid REFERENCES monitors(id) ON DELETE SET NULL,
  procurement_id uuid NOT NULL REFERENCES procurements(id),
  kind          text NOT NULL,                -- new | changed | deadline
  created_at    timestamptz NOT NULL DEFAULT now(),
  read_at       timestamptz,
  UNIQUE (monitor_id, procurement_id, kind)   -- evita alerta duplicado
);

CREATE TABLE ai_runs (
  id             uuid PRIMARY KEY,
  org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by   uuid NOT NULL REFERENCES users(id),
  kind           text NOT NULL,               -- analysis | qa | compat | proposal | appeal | impugnation
  procurement_id uuid REFERENCES procurements(id),
  status         text NOT NULL,               -- queued | running | succeeded | failed | canceled
  input          jsonb NOT NULL,
  output         jsonb,                       -- validado por schema
  provider       text,
  model_id       text,
  credential_id  uuid,                        -- ai_credentials usada (plataforma ou BYOK)
  prompt_version text,
  tokens_in      int,
  tokens_out     int,
  cost_micros    bigint,
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);

-- Provedores de IA (ver 16-provedores-ia.md). org_id NULL = credencial da plataforma.
CREATE TABLE ai_credentials (
  id             uuid PRIMARY KEY,
  org_id         uuid REFERENCES organizations(id) ON DELETE CASCADE,
  provider       text NOT NULL,              -- anthropic | openai | google | groq | openrouter | ollama | openai_compatible
  base_url       text,
  label          text NOT NULL,
  key_ciphertext bytea,                      -- AES-256-GCM; NULL para endpoints locais sem chave
  key_last4      text,
  data_key_id    text NOT NULL,              -- referência à data key cifrada no KMS
  status         text NOT NULL DEFAULT 'untested', -- untested | ok | auth_failed | revoked
  last_tested_at timestamptz,
  created_by     uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_models (
  id             uuid PRIMARY KEY,
  credential_id  uuid NOT NULL REFERENCES ai_credentials(id) ON DELETE CASCADE,
  model_id       text NOT NULL,              -- ID do provedor, vindo de listModels/configuração
  display_name   text,
  capabilities   jsonb NOT NULL,             -- context_tokens, structured_output, streaming, tool_calling, prompt_caching
  price_in_per_mtok  numeric(12,6),
  price_out_per_mtok numeric(12,6),
  enabled        boolean NOT NULL DEFAULT true,
  UNIQUE (credential_id, model_id)
);

CREATE TABLE ai_routing (
  org_id         uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  fast_model_id      uuid REFERENCES ai_models(id),
  analyst_model_id   uuid REFERENCES ai_models(id),
  writer_model_id    uuid REFERENCES ai_models(id),
  members_can_choose boolean NOT NULL DEFAULT true,
  fallback_model_id  uuid REFERENCES ai_models(id),
  monthly_budget_micros bigint,
  version        int NOT NULL DEFAULT 1
);
-- RLS em ai_credentials/ai_models/ai_routing; linhas da plataforma (org_id NULL) visíveis só por papel interno.

CREATE TABLE idempotency_keys (
  org_id      uuid NOT NULL,
  key         uuid NOT NULL,
  request_hash text NOT NULL,
  response    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, key)
);

CREATE TABLE outbox (
  id          bigserial PRIMARY KEY,
  topic       text NOT NULL,
  payload     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  org_id      uuid,
  actor_id    uuid,
  action      text NOT NULL,
  target_type text,
  target_id   text,
  ip          inet,
  before      jsonb,
  after       jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);
-- audit_log: apenas INSERT para o papel da aplicação (REVOKE UPDATE, DELETE)
```

## 7. Row-Level Security

```sql
ALTER TABLE pipeline_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_cards FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON pipeline_cards
  USING (org_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);
```

- A API define `SET LOCAL app.org_id = '<uuid do token>'` no início de cada transação (com PgBouncer em modo transação, sempre `SET LOCAL`).
- A aplicação conecta com um papel **sem** `BYPASSRLS` e que não é dono das tabelas. Migrations e workers de manutenção usam papéis separados.
- Sem `app.org_id`, `current_setting(..., true)` devolve `NULL` e a política não casa: retorno vazio.
- Repetir a política em todas as tabelas de tenant (gerar por migration helper) e testar com um teste que percorre `pg_policies` e falha se alguma tabela com `org_id` não tiver RLS.

## 8. Retenção

| Dado                   | Retenção sugerida                                     |
| ---------------------- | ----------------------------------------------------- |
| `ingest_raw`           | 90 dias (reprocessamento), depois apenas amostras     |
| `ai_runs.input/output` | Configurável por organização; padrão 12 meses         |
| `audit_log`            | 5 anos (revisar com jurídico)                         |
| Contas encerradas      | Exclusão/anonimização conforme `10-seguranca-lgpd.md` |
