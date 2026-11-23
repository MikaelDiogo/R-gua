-- Régua: libera espaço no banco gratuito (Neon: 1 GB por projeto).
-- `ingest_raw` guarda a resposta bruta do PNCP de cada coleta (jsonb) e só cresce: o job de manutenção do
-- worker (apps/worker/src/store.ts → maintenance) fecha editais vencidos e refaz o vocabulário, mas NÃO
-- apaga payloads antigos. A rotina agendada (.github/workflows/ingest.yml) roda este mesmo DELETE a cada coleta.
--
-- Pode rodar à mão no SQL Editor da Neon (como agora_app ou dono). Mantém os últimos 3 dias.

DELETE FROM ingest_raw WHERE fetched_at < now() - interval '3 days';

-- Quanto espaço cada tabela ocupa (para decidir se precisa apertar mais):
SELECT relname AS tabela, pg_size_pretty(pg_total_relation_size(relid)) AS tamanho
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 8;

SELECT pg_size_pretty(pg_database_size(current_database())) AS banco_total;
