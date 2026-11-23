-- 0005: monitores, alertas e peças jurídicas (recursos e impugnações). Tudo do usuário, com RLS por user_id.

CREATE TABLE monitors (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           text NOT NULL,
  intent         jsonb NOT NULL,
  frequency      text NOT NULL CHECK (frequency IN ('immediate','daily')),
  channels       text[] NOT NULL DEFAULT '{app}',
  active         boolean NOT NULL DEFAULT true,
  last_run_at    timestamptz,
  -- Marca-d'água do que já foi visto em procurement_changes: só alertamos mudanças depois dela.
  last_change_id bigint NOT NULL DEFAULT 0,
  version        int NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX monitors_user_idx ON monitors (user_id, created_at DESC);

CREATE TABLE monitor_hits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  monitor_id      uuid NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  procurement_id  uuid NOT NULL REFERENCES procurements(id) ON DELETE CASCADE,
  -- baseline = já casava quando o monitor foi criado: serve só para não alertar o que já existia.
  kind            text NOT NULL CHECK (kind IN ('new','changed','baseline')),
  change_id       bigint,
  change          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  read_at         timestamptz
);
CREATE UNIQUE INDEX monitor_hits_seen_uq ON monitor_hits (monitor_id, procurement_id) WHERE kind IN ('new','baseline');
CREATE UNIQUE INDEX monitor_hits_change_uq ON monitor_hits (monitor_id, change_id) WHERE kind = 'changed';
CREATE INDEX monitor_hits_unread_idx ON monitor_hits (user_id, created_at DESC) WHERE kind <> 'baseline';

CREATE TABLE legal_pieces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  procurement_id  uuid NOT NULL REFERENCES procurements(id),
  kind            text NOT NULL CHECK (kind IN ('impugnation','appeal','counter_arguments')),
  input           jsonb NOT NULL,
  sections        jsonb NOT NULL,
  sources         jsonb NOT NULL DEFAULT '[]',
  deadline        jsonb NOT NULL,
  placeholders    jsonb NOT NULL DEFAULT '[]',
  warnings        jsonb NOT NULL DEFAULT '[]',
  web_search      text NOT NULL DEFAULT 'skipped',
  version         int NOT NULL DEFAULT 1,
  model           text,
  took_ms         int,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX legal_pieces_user_idx ON legal_pieces (user_id, updated_at DESC);

ALTER TABLE monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitors FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON monitors
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

ALTER TABLE monitor_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitor_hits FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON monitor_hits
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

ALTER TABLE legal_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_pieces FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON legal_pieces
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
