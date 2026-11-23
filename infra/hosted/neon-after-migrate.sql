-- Régua: PLANO B de permissões na Neon. Só use se, no neon-setup.sql, o ALTER DEFAULT PRIVILEGES for recusado.
-- Rode DEPOIS das migrations, no SQL Editor, como dono do banco (ou como agora_migrator).
-- Entrega à aplicação o mesmo acesso que os privilégios padrão dariam. Idempotente; rode de novo após
-- cada migration nova, enquanto os privilégios padrão não estiverem funcionando.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO agora_app, agora_worker_maint;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO agora_app, agora_worker_maint;

-- A migration 0001 tirou UPDATE e DELETE do audit_log (trilha só de inclusão). O GRANT acima devolveu: refaça.
REVOKE UPDATE, DELETE ON audit_log FROM agora_app, agora_worker_maint;
