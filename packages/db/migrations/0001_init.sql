-- 0001: dados públicos (PNCP), busca lexical, pipeline do tenant com RLS. Ver docs/07.
-- Executada como agora_migrator: as tabelas pertencem a ele; a aplicação (agora_app) só recebe DML via default privileges.

-- unaccent não é IMMUTABLE; o wrapper permite usá-lo em coluna gerada e índice.
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

CREATE TABLE ingest_raw (
  id           bigserial PRIMARY KEY,
  source       text NOT NULL,
  endpoint     text NOT NULL,
  params       jsonb NOT NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  http_status  int NOT NULL,
  status       text NOT NULL,
  body         jsonb
);

CREATE TABLE ingest_window (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source       text NOT NULL,
  endpoint     text NOT NULL,
  modality     smallint,
  window_start text NOT NULL,
  window_end   text NOT NULL,
  state        text NOT NULL CHECK (state IN ('pending','running','ok','partial','failed')),
  attempts     int NOT NULL DEFAULT 0,
  records      int NOT NULL DEFAULT 0,
  last_error   text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, endpoint, modality, window_start, window_end)
);

CREATE TABLE organs (
  cnpj              text PRIMARY KEY,
  name              text NOT NULL,
  sphere            text,
  power             text,
  uf                char(2),
  municipality_ibge text
);
CREATE INDEX organs_name_trgm ON organs USING gin (immutable_unaccent(lower(name)) gin_trgm_ops);

CREATE TABLE procurements (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_controle_pncp  text NOT NULL UNIQUE,
  organ_cnpj            text NOT NULL REFERENCES organs(cnpj),
  process_number        text,
  edital_number         text,
  year                  int NOT NULL,
  sequence              int NOT NULL,
  modality              smallint NOT NULL,
  modality_name         text NOT NULL,
  status                text NOT NULL,
  status_raw            text NOT NULL,
  object_text           text NOT NULL,
  object_raw            text,
  estimated_value       numeric(18,2),
  uf                    char(2),
  municipality_ibge     text,
  municipality_name     text,
  unit_name             text,
  published_at          timestamptz,
  proposals_open_at     timestamptz,
  proposals_close_at    timestamptz,
  pncp_updated_at       timestamptz,
  srp                   boolean NOT NULL DEFAULT false,
  is_open               boolean NOT NULL DEFAULT false,
  quality_flags         text[] NOT NULL DEFAULT '{}',
  content_hash          text NOT NULL,
  source_url            text,
  origin_url            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
-- `is_open` não é coluna gerada (now() não é imutável): a ingestão grava e um job fecha os vencidos.
-- A busca SEMPRE reaplica proposals_close_at > now() quando pede "abertos" (docs/07 §3).
CREATE INDEX procurements_filters_idx ON procurements (uf, modality, status, proposals_close_at);
CREATE INDEX procurements_published_idx ON procurements (published_at DESC);
CREATE INDEX procurements_close_idx ON procurements (proposals_close_at);
CREATE INDEX procurements_organ_idx ON procurements (organ_cnpj);
CREATE INDEX procurements_value_idx ON procurements (estimated_value);

CREATE TABLE procurement_changes (
  id              bigserial PRIMARY KEY,
  procurement_id  uuid NOT NULL REFERENCES procurements(id) ON DELETE CASCADE,
  changed_at      timestamptz NOT NULL DEFAULT now(),
  fields          text[] NOT NULL,
  before          jsonb,
  after           jsonb
);

-- Busca lexical (FTS nativo com stemming em português e sem acentos). BM25 (pg_search) entra depois de medir (ADR-003).
CREATE TABLE procurement_search (
  procurement_id  uuid PRIMARY KEY REFERENCES procurements(id) ON DELETE CASCADE,
  lexical_text    text NOT NULL,
  tsv             tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', immutable_unaccent(lexical_text))) STORED,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX procurement_search_tsv_idx ON procurement_search USING gin (tsv);

-- Vocabulário do corpus para sugestão e correção ortográfica (pg_trgm).
CREATE TABLE search_vocab (
  term  text PRIMARY KEY,
  freq  int NOT NULL
);
CREATE INDEX search_vocab_trgm ON search_vocab USING gin (term gin_trgm_ops);

-- ── Tenant ────────────────────────────────────────────────────────────────
CREATE TABLE organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pipeline_cards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  procurement_id  uuid NOT NULL REFERENCES procurements(id),
  state           text NOT NULL CHECK (state IN ('descoberto','em_analise','em_preparacao','proposta_enviada','em_disputa','ganho','perdido','desistencia','descartado')),
  assignee        text,
  notes           text,
  version         int NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, procurement_id)
);
CREATE INDEX pipeline_cards_org_state_idx ON pipeline_cards (org_id, state);

CREATE TABLE idempotency_keys (
  org_id       uuid NOT NULL,
  key          uuid NOT NULL,
  request_hash text NOT NULL,
  response     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, key)
);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  org_id      uuid,
  actor       text,
  action      text NOT NULL,
  target_type text,
  target_id   text,
  before      jsonb,
  after       jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);

-- RLS (docs/07 §7). Sem app.org_id a política não casa: retorno vazio.
ALTER TABLE pipeline_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_cards FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pipeline_cards
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON idempotency_keys
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

-- audit_log: a aplicação só insere (docs/07 §6).
REVOKE UPDATE, DELETE ON audit_log FROM agora_app, agora_worker_maint;

-- Organização de desenvolvimento (modo sem login). Remover quando houver identidade.
INSERT INTO organizations (id, name) VALUES ('00000000-0000-4000-8000-000000000001', 'Organização de desenvolvimento');
