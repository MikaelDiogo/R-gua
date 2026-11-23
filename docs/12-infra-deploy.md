# 12 — Infraestrutura e deploy

## 0. Deploy em um VPS (Docker Compose): runbook

Esta seção é o caminho prático para colocar o Régua no ar em **um VPS Linux único (4–8 GB)**. As seções seguintes (1 a 5) descrevem a topologia de referência para quando houver escala.

### 0.1 O que sobe

| Serviço    | Imagem                           | Porta publicada | Função                                                                  |
| ---------- | -------------------------------- | --------------- | ----------------------------------------------------------------------- |
| `caddy`    | `caddy:2-alpine`                 | **80, 443**     | HTTPS automático (Let's Encrypt), proxy para o web                      |
| `web`      | `agora-web` (Next.js standalone) | nenhuma         | Telas; encaminha `/api/*` para a API                                    |
| `api`      | `agora-node`                     | nenhuma         | NestJS + Fastify (porta interna 3101)                                   |
| `worker`   | `agora-node`                     | nenhuma         | Ingestão periódica do PNCP (`ingest.js schedule`)                       |
| `migrate`  | `agora-node`                     | nenhuma         | Aplica as migrations (one-shot) antes de api e worker                   |
| `postgres` | `paradedb/paradedb:0.26.4-pg17`  | nenhuma         | Banco (rede interna, sem saída para a internet)                         |
| `redis`    | `redis:7-alpine`                 | nenhuma         | Reservado para filas; hoje o código ainda não o usa. Exige senha        |

Só o Caddy aceita conexões de fora. A API nunca fica exposta diretamente. Memória reservada (limites): ~6 GB somados; em 4 GB reduza os `mem_limit` do compose ou use 8 GB.

### 0.2 Pré-requisitos

- VPS Linux (Ubuntu 24.04 LTS ou similar) com **8 GB** (4 GB funciona só para teste), acesso root/sudo e Docker Engine com o plugin Compose v2.
- Um domínio com registro **A** (e AAAA, se houver IPv6) apontando para o IP do VPS. O Caddy só emite o certificado quando o DNS já aponta para o servidor.
- Chaves de IA e pesquisa: `GEMINI_API_KEY` e `TAVILY_API_KEY`. Elas vivem **só** no `.env` do servidor.

### 0.3 Primeiro deploy

```bash
# 1. Firewall: só SSH e web (ufw)
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable

# 2. Código
sudo mkdir -p /opt/agora && sudo chown "$USER" /opt/agora
git clone <URL-do-repositorio> /opt/agora && cd /opt/agora

# 3. Configuração
cp .env.production.example .env
chmod 600 .env
#   Preencha DOMAIN, ACME_EMAIL e as chaves de IA.
#   Gere cada senha com:  openssl rand -hex 24   (só letras e números: elas entram em URLs)
#   POSTGRES_PASSWORD, MIGRATOR_DB_PASSWORD, APP_DB_PASSWORD, MAINT_DB_PASSWORD, REDIS_PASSWORD

# 4. Build, migrations e subida (espera ficar saudável)
infra/scripts/deploy.sh --no-pull

# 5. Primeiro usuário (sistema fechado: não há cadastro público)
docker compose -f docker-compose.prod.yml exec api \
  node apps/api/dist/cli/users.js create admin --name "Administrador"
#   A senha é gerada, mostrada UMA vez e nunca guardada em claro. Anote-a num gerenciador de senhas.
#   Para escolher a senha: exporte ADMIN_PW (mín. 10 caracteres) e use  --password-env ADMIN_PW
```

> **`admin`/`admin` não pode ir para produção.** Com `NODE_ENV=production`, a API **recusa subir** se existir uma conta com senha padrão ou fraca. A senha do usuário de desenvolvimento nunca deve ser reaproveitada: crie as contas de produção do zero com o comando acima (ou troque com `... users.js reset admin`).

Depois de subir, confira:

```bash
docker compose -f docker-compose.prod.yml ps          # todos "healthy"/"running"; migrate "exited (0)"
curl -sI https://SEU-DOMINIO/login | head -1          # HTTP/2 200
curl -s https://SEU-DOMINIO/api/healthz               # resposta de saúde da API (pelo proxy do web)
```

A primeira ingestão do PNCP roda assim que o worker sobe e se repete a cada `INGEST_INTERVAL_MIN` minutos (padrão 360), só para as UFs em `INGEST_UFS` (padrão `CE,PI`). Acompanhe com `docker compose -f docker-compose.prod.yml logs -f worker`.

### 0.4 Atualizar

```bash
cd /opt/agora && infra/scripts/deploy.sh
```

O script faz `git pull --ff-only`, reconstrói as imagens, roda as migrations (`migrate`), sobe os serviços e espera todos ficarem saudáveis; se algum falhar, mostra os logs e sai com erro. Migrations seguem expand → migrate → contract (§3). Para voltar a uma versão anterior: `git checkout <tag/commit>` e rode `deploy.sh --no-pull` (migrations já aplicadas não são desfeitas: por isso só adicione colunas compatíveis).

### 0.5 Backup e restauração

- **Backup:** `infra/scripts/backup.sh` gera `pg_dump -Fc` em `/var/backups/agora` (permissão 600, pasta 700) e apaga os mais antigos que `RETAIN_DAYS` (padrão 14). Agende todo dia:

  ```cron
  # crontab -e  (como o usuário que roda o Docker)
  0 3 * * * cd /opt/agora && BACKUP_DIR=/var/backups/agora RETAIN_DAYS=14 infra/scripts/backup.sh >> /var/log/agora-backup.log 2>&1
  ```

  Copie os dumps para **fora do VPS** (outro servidor ou armazenamento de objetos, com criptografia): backup que mora no mesmo disco não protege contra a perda do disco.
- **Restauração:** `infra/scripts/restore.sh /var/backups/agora/agora-AAAA-MM-DD-HHMMSS.dump`. É destrutivo e pede confirmação; ele para web/api/worker, restaura e sobe tudo de novo.
- **Teste mensal:** restaure o dump mais recente num servidor de teste e confira login e busca. Registre a data (§5).
- Os índices de busca são reconstruíveis a partir das tabelas e do `ingest_raw`; o dado crítico são as contas, o pipeline, as propostas e os monitores.

### 0.6 Rotação de segredos

O script de criação de papéis (`infra/docker/postgres/init`) só roda na **criação do volume**. Para trocar uma senha do banco depois:

```bash
# 1. Gere a nova senha e altere no banco
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d agora -c "ALTER ROLE agora_app PASSWORD 'NOVA_SENHA'"
# 2. Atualize APP_DB_PASSWORD no .env e recrie os serviços que a usam
docker compose -f docker-compose.prod.yml up -d --force-recreate api worker
```

Faça o mesmo para `agora_migrator` (`MIGRATOR_DB_PASSWORD`) e `agora_worker_maint` (`MAINT_DB_PASSWORD`). Para `REDIS_PASSWORD` e as chaves de IA, edite o `.env` e rode `up -d --force-recreate`. Se uma chave vazar, **revogue-a no provedor primeiro**, depois troque. Segredos nunca entram no repositório, em logs ou em traces. O `.env` fica com `chmod 600`.

### 0.7 O que monitorar

- `docker compose -f docker-compose.prod.yml ps`: algum serviço `unhealthy` ou reiniciando.
- Logs da API (`logs api`): `request_id` nas falhas; picos de `429` (limite de uso) ou erros da IA.
- Logs do worker: janelas de ingestão com erro; `429` da fonte nunca deve virar "sem resultados" (docs/05 §8).
- Disco (`df -h`, volume `pgdata`, pasta de backups) e memória (`docker stats --no-stream`).
- Validade do certificado (o Caddy renova sozinho; alerta se a renovação falhar) e a data do último backup.
- Cota e custo das chaves Gemini e Tavily nos painéis dos provedores.
- Atualizações de segurança do sistema (`unattended-upgrades`) e do Docker; CI com `pnpm audit` sem achados altos.

### 0.8 Limites conhecidos desta topologia

- Um só VPS: sem alta disponibilidade. O RPO é o intervalo do backup (24 h com o cron acima); reduza para a cada hora se necessário.
- `pg_search` é AGPL: a decisão de licença continua aberta (docs/15).
- O compose usa a imagem `latest` local construída no próprio servidor; para ambientes maiores, publique imagens versionadas num registro.

## Topologia de referência (escala)


## 1. Ambientes

| Ambiente     | Uso                                    | Dados                                                         |
| ------------ | -------------------------------------- | ------------------------------------------------------------- |
| `local`      | Desenvolvimento (docker compose)       | Amostra de PNCP gravada + seeds                               |
| `staging`    | Validação, testes de carga e avaliação | Cópia parcial dos dados públicos; sem dados de clientes reais |
| `production` | Clientes                               | Região Brasil                                                 |

## 2. Topologia inicial (produção)

| Componente                                | Forma                                            | Observação                                                                                                  |
| ----------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| API                                       | 2+ réplicas em contêiner                         | Atrás de load balancer com TLS                                                                              |
| Worker                                    | 1–N réplicas                                     | Escala pela profundidade das filas                                                                          |
| Web (Next.js)                             | 2 réplicas ou plataforma de borda                | Assets em CDN                                                                                               |
| PostgreSQL (com `pg_search` + `pgvector`) | Instância gerenciada **ou** VM/contêiner próprio | Gerenciados nem sempre suportam `pg_search`: confirmar; se não, VM com ParadeDB e backup gerenciado por nós |
| Réplica de leitura                        | Opcional desde cedo                              | Dedicada à busca quando necessário                                                                          |
| PgBouncer                                 | Modo transação                                   | `SET LOCAL app.org_id` em toda transação                                                                    |
| Redis                                     | Gerenciado                                       | Filas, cache, rate limit                                                                                    |
| TEI (embeddings + reranker)               | GPU pequena ou CPU                               | Medir: CPU pode bastar para consultas; backfill pode usar GPU temporária                                    |
| doc-processor                             | Contêiner isolado                                | Sem acesso à rede interna                                                                                   |
| Armazenamento de objetos                  | S3-compatível                                    | PDFs e exportações                                                                                          |
| Secret manager / KMS                      | Gerenciado                                       | Segredos e chaves de IA                                                                                     |

Provedor de nuvem: escolher entre opções com região no Brasil (ex.: São Paulo). A arquitetura não depende de serviço proprietário além de KMS e armazenamento de objetos (ambos com alternativas).

## 3. CI/CD

1. Lint, typecheck, testes de unidade.
2. Testes de integração com Postgres real (Testcontainers com a mesma imagem de produção, incluindo extensões).
3. Testes de contrato (OpenAPI snapshot, fixtures do PNCP).
4. **Gate de busca:** conjunto de avaliação (`06` §9) quando o PR toca `search`, dicionário, embeddings ou migrations de índice.
5. **Gate de IA:** conjunto dourado quando o PR toca prompts ou roteamento.
6. Build de imagens, varredura de segurança, deploy em staging, smoke tests, deploy em produção com rollout gradual.
7. Migrations: expand → migrate → contract; índices criados com `CONCURRENTLY`; reindexação de vetores em background com troca por flag.

## 4. Custos (estimativa — preencher na Fase 0)

Planilha a manter com: banco (CPU/RAM proporcional ao índice quente), réplica, Redis, TEI (GPU/CPU), armazenamento de PDFs, tráfego, observabilidade e IA (custo por análise × análises por plano). Usar o custo de IA por análise, medido por provedor, para validar as cotas de `01` §5 contra os preços dos planos.

## 5. Backup e recuperação

- Backups contínuos (PITR) do Postgres; RPO alvo 15 min, RTO alvo 4 h.
- Índices de busca são **reconstruíveis** a partir das tabelas curadas e do `ingest_raw`; documentar e testar o tempo de reconstrução.
- Teste de restauração mensal registrado.
