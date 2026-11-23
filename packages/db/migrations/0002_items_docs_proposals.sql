-- 0002: itens e documentos das contratações, texto por página, análises de edital, perfil da empresa e propostas.

ALTER TABLE procurements ADD COLUMN items_collected_at timestamptz;
ALTER TABLE procurements ADD COLUMN documents_collected_at timestamptz;

CREATE TABLE procurement_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_id  uuid NOT NULL REFERENCES procurements(id) ON DELETE CASCADE,
  item_number     int NOT NULL,
  description     text NOT NULL,
  quantity        numeric(18,4),
  unit            text,
  unit_value      numeric(18,4),
  total_value     numeric(18,4),
  kind            text,
  situation       text,
  tsv             tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', immutable_unaccent(description))) STORED,
  UNIQUE (procurement_id, item_number)
);
CREATE INDEX procurement_items_tsv_idx ON procurement_items USING gin (tsv);
CREATE INDEX procurement_items_proc_idx ON procurement_items (procurement_id);

CREATE TABLE procurement_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_id  uuid NOT NULL REFERENCES procurements(id) ON DELETE CASCADE,
  sequence        int NOT NULL,
  title           text NOT NULL,
  doc_type        text NOT NULL,
  url             text NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  text_status     text NOT NULL DEFAULT 'pending' CHECK (text_status IN ('pending','ok','failed','too_large','scanned','unsupported')),
  pages           int,
  file_hash       text,
  processed_at    timestamptz,
  UNIQUE (procurement_id, sequence)
);

-- Texto por página: o servidor confere cada citação do leitor de edital contra estas linhas (docs/06 §10).
CREATE TABLE document_pages (
  document_id  uuid NOT NULL REFERENCES procurement_documents(id) ON DELETE CASCADE,
  idx          int NOT NULL,          -- posição sequencial dentro do documento
  label        text NOT NULL,         -- arquivo de origem (um ZIP pode conter vários PDFs)
  page         int NOT NULL,          -- página dentro do arquivo
  text         text NOT NULL,
  PRIMARY KEY (document_id, idx)
);

-- Análise de edital em cache (conteúdo público, igual para todos): chave = documentos lidos + versão do prompt.
CREATE TABLE edital_analyses (
  procurement_id  uuid PRIMARY KEY REFERENCES procurements(id) ON DELETE CASCADE,
  input_hash      text NOT NULL,
  prompt_version  text NOT NULL,
  model           text NOT NULL,
  result          jsonb NOT NULL,
  citations_total int NOT NULL DEFAULT 0,
  citations_verified int NOT NULL DEFAULT 0,
  tokens_in       int,
  tokens_out      int,
  truncated       boolean NOT NULL DEFAULT false,
  took_ms         int,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Tenant ────────────────────────────────────────────────────────────────
CREATE TABLE company_profiles (
  org_id      uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  profile     jsonb NOT NULL,
  version     int NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE proposals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  procurement_id  uuid NOT NULL REFERENCES procurements(id),
  sections        jsonb NOT NULL,
  prices          jsonb NOT NULL,
  items           jsonb NOT NULL,
  total           numeric(18,2) NOT NULL,
  placeholders    jsonb NOT NULL DEFAULT '[]',
  warnings        jsonb NOT NULL DEFAULT '[]',
  version         int NOT NULL DEFAULT 1,
  model           text,
  took_ms         int,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX proposals_org_idx ON proposals (org_id, updated_at DESC);

ALTER TABLE company_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON company_profiles
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON proposals
  USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
