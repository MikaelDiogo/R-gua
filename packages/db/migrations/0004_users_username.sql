-- 0004: sistema fechado, login por usuário (não por e-mail). Contas de teste do cadastro público são descartadas.
DELETE FROM users;  -- sessions, pipeline_cards, proposals, company_profiles e idempotency_keys saem em cascata
ALTER TABLE users RENAME COLUMN email TO username;
ALTER TABLE users ADD CONSTRAINT users_username_format CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$');
