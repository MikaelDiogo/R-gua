-- 0003: autenticação por e-mail e senha, sem organização. Os dados do tenant passam a ser do usuário (RLS por user_id).
-- Também restringe a base a Ceará e Piauí.

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext NOT NULL UNIQUE,
  password_hash  text NOT NULL,           -- scrypt: scrypt$N$r$p$salt$hash
  name           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Só o hash do token fica no banco: um vazamento da tabela não entrega sessões válidas.
CREATE TABLE sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  user_agent    text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- Dados de teste do modo sem login (organização fixa) não pertencem a ninguém: descartados.
-- TRUNCATE (e não DELETE): o RLS FORCE também filtra o dono da tabela, e o DELETE não enxergaria as linhas.
TRUNCATE proposals, pipeline_cards, company_profiles, idempotency_keys;

DROP POLICY tenant_isolation ON pipeline_cards;
DROP POLICY tenant_isolation ON company_profiles;
DROP POLICY tenant_isolation ON proposals;
DROP POLICY tenant_isolation ON idempotency_keys;

ALTER TABLE pipeline_cards DROP COLUMN org_id CASCADE;
ALTER TABLE pipeline_cards ADD COLUMN user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE pipeline_cards ADD CONSTRAINT pipeline_cards_user_proc_key UNIQUE (user_id, procurement_id);
CREATE INDEX pipeline_cards_user_state_idx ON pipeline_cards (user_id, state);

ALTER TABLE company_profiles DROP COLUMN org_id CASCADE;
ALTER TABLE company_profiles ADD COLUMN user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE proposals DROP COLUMN org_id CASCADE;
ALTER TABLE proposals ADD COLUMN user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX proposals_user_idx ON proposals (user_id, updated_at DESC);

ALTER TABLE idempotency_keys DROP COLUMN org_id CASCADE;
ALTER TABLE idempotency_keys ADD COLUMN user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE idempotency_keys ADD PRIMARY KEY (user_id, key);

ALTER TABLE audit_log RENAME COLUMN org_id TO user_id;

DROP TABLE organizations CASCADE;

CREATE POLICY tenant_isolation ON pipeline_cards
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY tenant_isolation ON company_profiles
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY tenant_isolation ON proposals
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY tenant_isolation ON idempotency_keys
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

-- Cobertura: Ceará e Piauí. Tudo de fora (e o que depende) sai da base.
DELETE FROM procurements WHERE uf IS NULL OR uf NOT IN ('CE', 'PI');
DELETE FROM organs o WHERE NOT EXISTS (SELECT 1 FROM procurements p WHERE p.organ_cnpj = o.cnpj);
DELETE FROM ingest_raw;
DELETE FROM ingest_window;
DELETE FROM search_vocab;
