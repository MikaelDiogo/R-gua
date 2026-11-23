-- Régua: preparação ÚNICA do banco na Neon (plano gratuito). Rode no SQL Editor da Neon,
-- conectado como o dono do banco (na Neon costuma ser `neondb_owner`), ANTES de rodar as migrations.
--
-- ANTES DE COLAR: troque as 3 senhas abaixo (TROCAR_SENHA_*) por senhas fortes, só com letras e números
-- (elas entram em URLs). Gere assim:  openssl rand -hex 24      (ou use um gerador de senhas)
-- Guarde as 3 senhas: você vai usá-las nas URLs de conexão (docs/deploy-gratuito.md §2).
--
-- É idempotente: pode rodar de novo (cria só o que falta e reaplica senhas e permissões).
-- Espelha infra/docker/postgres/init/01-roles-and-extensions.sh, de onde vêm as mesmas regras:
--   * agora_migrator é DONO das tabelas (roda as migrations);
--   * agora_app e agora_worker_maint NÃO são donos e NÃO têm BYPASSRLS (a RLS por usuário vale para eles);
--   * tudo que o migrator criar fica acessível ao app por ALTER DEFAULT PRIVILEGES.
-- Diferenças para o Docker, por a Neon não dar superusuário: sem CREATEROLE no migrator (nenhuma migration
-- cria papéis) e sem as extensões `vector` e `pg_search` (o código atual não usa nenhuma das duas).

-- ── Papéis ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'agora_migrator') THEN
    CREATE ROLE agora_migrator LOGIN PASSWORD 'TROCAR_SENHA_MIGRATOR';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'agora_app') THEN
    CREATE ROLE agora_app LOGIN PASSWORD 'TROCAR_SENHA_APP';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'agora_worker_maint') THEN
    CREATE ROLE agora_worker_maint LOGIN PASSWORD 'TROCAR_SENHA_MAINT';
  END IF;
END
$$;

-- Reaplica as senhas. Papel novo já nasce NOSUPERUSER e NOBYPASSRLS (padrão do Postgres); a Neon não deixa
-- o dono do banco mexer nesses atributos, então eles não são citados aqui. A conferência no fim prova que valem.
ALTER ROLE agora_migrator PASSWORD 'TROCAR_SENHA_MIGRATOR';
ALTER ROLE agora_app PASSWORD 'TROCAR_SENHA_APP';
ALTER ROLE agora_worker_maint PASSWORD 'TROCAR_SENHA_MAINT';

-- ── Acesso ao banco e ao schema ─────────────────────────────────────────────
-- O nome do banco na Neon é `neondb` por padrão; current_database() serve para qualquer nome.
DO $$
BEGIN
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO agora_migrator, agora_app, agora_worker_maint',
    current_database()
  );
END
$$;

GRANT ALL ON SCHEMA public TO agora_migrator;
GRANT USAGE ON SCHEMA public TO agora_app, agora_worker_maint;

-- Sem superusuário, só quem é membro de agora_migrator pode definir privilégios padrão "FOR ROLE agora_migrator".
-- O dono do banco criou o papel (tem ADMIN OPTION), então pode se incluir nele. Idempotente.
GRANT agora_migrator TO CURRENT_USER;

-- Tudo que o migrator criar fica acessível à aplicação, sem torná-la dona.
-- (Se a Neon recusar os 2 comandos abaixo, pule-os e use neon-after-migrate.sql depois das migrations.)
ALTER DEFAULT PRIVILEGES FOR ROLE agora_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO agora_app, agora_worker_maint;
ALTER DEFAULT PRIVILEGES FOR ROLE agora_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO agora_app, agora_worker_maint;

-- ── Extensões usadas pelas migrations ───────────────────────────────────────
--   unaccent  immutable_unaccent() e a busca de texto sem acento (0001, 0002)
--   pg_trgm   sugestão e correção ortográfica, índices gin_trgm_ops (0001)
--   citext    usuário/e-mail sem diferenciar maiúsculas (0003, 0004)
--   pgcrypto  mantida por paridade com o Docker (gen_random_uuid já é nativo no Postgres 13+)
-- Todas são "trusted": o dono do banco instala sem ser superusuário. Se algum comando falhar com
-- "permission denied", ative a extensão pelo painel da Neon (Project → Extensions) e rode de novo.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

-- ── Conferência (rode e leia o resultado) ───────────────────────────────────
-- Deve listar os 3 papéis, com rolbypassrls = false e rolsuper = false.
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
FROM pg_roles
WHERE rolname LIKE 'agora_%'
ORDER BY rolname;

-- Deve listar as 4 extensões (unaccent, pg_trgm, citext, pgcrypto) além de plpgsql.
SELECT extname, extversion FROM pg_extension ORDER BY extname;
