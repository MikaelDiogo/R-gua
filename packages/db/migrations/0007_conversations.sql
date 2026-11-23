-- 0007: histórico de conversas do chat de IA. Tudo do usuário, com RLS por user_id (mesmo padrão de 0005).

CREATE TABLE conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_user_recent_idx ON conversations (user_id, updated_at DESC, id DESC);

CREATE TABLE conversation_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role             text NOT NULL CHECK (role IN ('user','assistant')),
  prompt           text,
  sources          jsonb,
  scope            text CHECK (scope IN ('open','all')),
  response         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- Cada papel guarda só o que é dele; a resposta completa tem teto de 2 MB.
  CONSTRAINT conversation_messages_shape CHECK (
    (role = 'user' AND prompt IS NOT NULL AND response IS NULL)
    OR (role = 'assistant' AND response IS NOT NULL AND prompt IS NULL)
  ),
  CONSTRAINT conversation_messages_response_size CHECK (response IS NULL OR octet_length(response::text) <= 2097152)
);
CREATE INDEX conversation_messages_conv_idx ON conversation_messages (conversation_id, created_at, id);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conversations
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conversation_messages
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
