#!/bin/sh
# Papéis separados (docs/07 §7): a aplicação NÃO é dona das tabelas e NÃO tem BYPASSRLS.
# Senhas vêm do ambiente do contêiner; sem variável, valem os padrões de DESENVOLVIMENTO (compose local).
# Em produção o docker-compose.prod.yml exige todas as variáveis. Este script só roda na criação do volume.
(
set -eu

export MIGRATOR_DB_PASSWORD="${MIGRATOR_DB_PASSWORD:-agora_migrator}"
export APP_DB_PASSWORD="${APP_DB_PASSWORD:-agora_app}"
export MAINT_DB_PASSWORD="${MAINT_DB_PASSWORD:-agora_worker_maint}"

# \getenv lê a senha do ambiente do psql: ela não aparece na linha de comando nem em `ps`.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv migrator_pw MIGRATOR_DB_PASSWORD
\getenv app_pw APP_DB_PASSWORD
\getenv maint_pw MAINT_DB_PASSWORD

CREATE ROLE agora_migrator LOGIN PASSWORD :'migrator_pw' CREATEROLE;
CREATE ROLE agora_app LOGIN PASSWORD :'app_pw' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE agora_worker_maint LOGIN PASSWORD :'maint_pw' NOSUPERUSER NOBYPASSRLS;

GRANT CONNECT ON DATABASE agora TO agora_migrator, agora_app, agora_worker_maint;
GRANT ALL ON SCHEMA public TO agora_migrator;
GRANT USAGE ON SCHEMA public TO agora_app, agora_worker_maint;

-- Tudo que o migrator criar fica acessível à aplicação, sem torná-la dona.
ALTER DEFAULT PRIVILEGES FOR ROLE agora_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO agora_app, agora_worker_maint;
ALTER DEFAULT PRIVILEGES FOR ROLE agora_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO agora_app, agora_worker_maint;

-- Extensões (docs/07 §2). Criadas aqui pelo superusuário.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_search;
SQL

# Ajuste de memória para um VPS de 4–8 GB (POSTGRES_TUNE=1 só no compose de produção).
# ALTER SYSTEM grava em postgresql.auto.conf; vale quando o servidor real sobe após a inicialização.
if [ "${POSTGRES_TUNE:-0}" = "1" ]; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
ALTER SYSTEM SET shared_buffers = '768MB';
ALTER SYSTEM SET effective_cache_size = '2GB';
ALTER SYSTEM SET work_mem = '16MB';
ALTER SYSTEM SET maintenance_work_mem = '256MB';
ALTER SYSTEM SET max_connections = '50';
ALTER SYSTEM SET log_min_duration_statement = '1000';
SQL
fi
)
