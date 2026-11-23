# Colocar o Régua no ar de graça (Neon + Render + Vercel + GitHub Actions)

Guia técnico. A versão para quem nunca publicou um sistema está em `manual/14-colocar-no-ar-gratis.md`.
Para produção de verdade (clientes, sem dormir, sem limites), use o VPS: `12-infra-deploy.md`.

> **Nada aqui foi executado de verdade.** Os arquivos foram escritos a partir do código do repositório e da
> documentação dos serviços, sem criar conta nem publicar. A lista do que conferir no primeiro deploy está
> em [§10](#10-o-que-não-foi-validado).

## 1. Visão geral

```
Navegador ──► Vercel (site Next.js)  ──/api/*──►  Render (API NestJS)  ──►  Neon (PostgreSQL)
                                                        ▲                        ▲
                                  GitHub Actions ───────┘ (tique, monitores)     │
                                  GitHub Actions ───────────── (coleta do PNCP) ─┘
```

| Peça | Serviço gratuito | Arquivo de apoio |
|---|---|---|
| Banco | Neon (PostgreSQL 17) | `infra/hosted/neon-setup.sql` |
| API | Render, web service `free` | `render.yaml` |
| Site | Vercel, plano Hobby | `apps/web/vercel.json` |
| Coleta do PNCP e monitores | GitHub Actions agendado | `.github/workflows/ingest.yml` |
| Redis | não precisa (o sistema não usa) | — |

O navegador só fala com a Vercel. O Next repassa `/api/*` para a API (`rewrites` em `apps/web/next.config.mjs`),
então o cookie de sessão é do mesmo site e não há CORS.

## 2. Banco na Neon

### 2.1 Criar o projeto

1. Crie a conta em neon.com e um projeto novo, PostgreSQL 17.
2. **Região: AWS US East 1 (N. Virginia).** Peso da decisão: a API faz várias consultas por requisição, então o
   banco precisa ficar **perto da API**, não perto de você. O Render gratuito não tem São Paulo; `virginia`
   fica na mesma região da AWS. Banco em São Paulo com API na Virgínia custaria ~120 ms por consulta.
3. Copie as strings de conexão (botão *Connect*). Há duas formas do mesmo endereço:
   - **direta**: `ep-xxxx.us-east-1.aws.neon.tech`
   - **com pooler**: `ep-xxxx-pooler.us-east-1.aws.neon.tech`

   **Use a direta** no Render e no GitHub. O código define `statement_timeout` ao conectar
   (`packages/db/src/pool.ts`), e o pooler da Neon pode recusar esse parâmetro de inicialização
   (*unsupported startup parameter*). Se um dia precisar do pooler, retire `statement_timeout` do pool.
4. O plano gratuito suspende o banco após alguns minutos parado; a primeira consulta depois disso demora
   um pouco mais (a conexão é reaberta sozinha: `pool.on('error')` + `connectionTimeoutMillis`).

### 2.2 Papéis e extensões (uma vez)

No *SQL Editor* da Neon, como dono do banco, rode `infra/hosted/neon-setup.sql` **depois de trocar** as três
senhas `TROCAR_SENHA_*` por senhas fortes, só com letras e números (`openssl rand -hex 24`). Ele cria:

- `agora_migrator` (dono das tabelas; roda as migrations),
- `agora_app` e `agora_worker_maint` (sem dono e sem `BYPASSRLS`: a RLS por usuário vale para eles),
- as extensões `unaccent`, `pg_trgm`, `citext`, `pgcrypto`. **Sem** `vector` e `pg_search`: nenhuma migration usa.

Adaptações em relação ao Docker (`infra/docker/postgres/init/01-roles-and-extensions.sh`): a Neon não dá
superusuário. Por isso o migrator não recebe `CREATEROLE` (nenhuma migration cria papéis) e o script faz
`GRANT agora_migrator TO CURRENT_USER`, necessário para `ALTER DEFAULT PRIVILEGES FOR ROLE agora_migrator`.
Se a Neon ainda recusar o `ALTER DEFAULT PRIVILEGES`, pule esses dois comandos e rode
`infra/hosted/neon-after-migrate.sql` depois das migrations (e de novo após cada migration nova).

Monte as URLs (troque host e senhas; a base na Neon costuma se chamar `neondb`):

```
MIGRATOR  postgres://agora_migrator:SENHA_MIGRATOR@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require
APP       postgres://agora_app:SENHA_APP@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require
```

### 2.3 Migrations (do seu computador)

As migrations rodam do PC, com o papel `agora_migrator`. O script `migrate` **não lê o `.env`**: passe a URL pelo
ambiente do terminal.

PowerShell:

```powershell
corepack pnpm --filter @agora/contracts --filter @agora/db build
$env:MIGRATOR_DATABASE_URL = "postgres://agora_migrator:SENHA_MIGRATOR@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require"
corepack pnpm --filter @agora/db migrate
Remove-Item Env:MIGRATOR_DATABASE_URL
```

Git Bash:

```bash
corepack pnpm --filter @agora/db build
MIGRATOR_DATABASE_URL='postgres://agora_migrator:SENHA_MIGRATOR@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require' \
  corepack pnpm --filter @agora/db migrate
```

Saída esperada: `migration aplicada: 0001_init.sql` … `0006_user_roles.sql` (seis linhas). Conferência no SQL Editor:
`SELECT count(*) FROM schema_migrations;` deve dar 6.

### 2.4 Dados: ingestão (recomendado) ou cópia

**Opção A, recomendada: deixar a coleta encher o banco.** Rode a ingestão do PC contra a Neon (leva uns 10–15 min;
o PNCP limita 12 chamadas/min):

```powershell
corepack pnpm --filter @agora/contracts --filter @agora/db --filter @agora/ingestion --filter @agora/worker build
$env:DATABASE_URL = "postgres://agora_app:SENHA_APP@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require"
node apps/worker/dist/ingest.js open --pages 8 --ufs CE,PI
Remove-Item Env:DATABASE_URL
```

Ou dispare a rotina do GitHub manualmente (§7), que faz o mesmo.

**Opção B: copiar o banco local (54 MB).** Só as tabelas públicas; **não** copie `ingest_raw` (grande e inútil),
nem usuários, funil ou propostas. Do Docker local:

```bash
docker exec agora-postgres-1 pg_dump -U postgres -d agora -Fc --data-only \
  -t organs -t procurements -t procurement_search -t procurement_changes -t procurement_items \
  -t procurement_documents -t document_pages -t search_vocab -t ingest_window \
  -f /tmp/regua-dados.dump
docker exec agora-postgres-1 pg_restore --no-owner --data-only \
  -d "postgres://agora_migrator:SENHA_MIGRATOR@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require" \
  /tmp/regua-dados.dump
```

A ordem das tabelas importa por causa das chaves estrangeiras; o `pg_restore` segue a ordem de dependência do
próprio dump. Não validado: se acusar erro de chave estrangeira, use a Opção A. As colunas geradas (`tsv`)
são recalculadas pelo banco.

### 2.5 Espaço: o limite de 1 GB

A Neon gratuita guarda 1 GB por projeto. Se encher, **gravações falham** (não há cobrança). O que cresce:

- `ingest_raw`: resposta bruta do PNCP de cada coleta. **Nada o limpa hoje**: o `maintenance`
  (`apps/worker/src/store.ts`) só fecha editais vencidos e refaz `search_vocab`. A rotina agendada do GitHub
  apaga o que tem mais de 3 dias a cada rodada; para rodar à mão use `infra/hosted/limpar-ingest-raw.sql`,
  que também mostra o tamanho de cada tabela.
- `procurements` e `procurement_search`: crescem com os editais coletados (CE e PI: dezenas de MB).

## 3. API no Render

1. Suba o projeto para o GitHub (§6) e, no Render, **New + → Blueprint**, escolhendo o repositório. O Render lê
   `render.yaml`. Ele cria o serviço `regua-api` e pede os valores marcados `sync: false`.
2. Variáveis (aba *Environment* do serviço):

| Variável | Valor |
|---|---|
| `DATABASE_URL` | URL **APP** da §2.2 (direta, `?sslmode=require`) |
| `APP_ORIGIN` | endereço do site na Vercel, `https://...`, sem barra no final (preencha depois do §4) |
| `CRON_SECRET` | `openssl rand -hex 24` (o mesmo valor no GitHub, §7) |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | os mesmos do seu `.env` local |
| `TAVILY_API_KEY` | idem |

   Já fixadas no `render.yaml`: `NODE_ENV=production`, `API_HOST=0.0.0.0`, `API_PORT=10000`, `TRUST_PROXY=1`,
   `COOKIE_SECURE=1`, `MONITOR_SCHEDULER=1`, `NODE_VERSION=24`. Não defina `REDIS_URL`: o teste de produção
   da API recusa Redis sem senha, e o sistema não usa Redis.
3. **Região**: `virginia` (o Render gratuito não tem São Paulo). Região de um serviço não muda depois de criado.
4. **Build**: `corepack enable && NODE_ENV=development pnpm install --frozen-lockfile --filter "@agora/api..." && pnpm --filter "@agora/api..." build`.
   O `...` depois do nome pede a API **e** os pacotes de que ela depende (contracts, domain, db, ingestion), na
   ordem certa. `NODE_ENV=development` só no install: com `production` o pnpm pularia o `typescript`.
5. **Start**: `node apps/api/dist/main.js`. Saúde: `/v1/healthz` (responde `{"status":"ok"}` só se o banco responde).
6. **A API recusa subir em produção** se: `APP_ORIGIN` não for `https://`, `COOKIE_SECURE=0`, `DATABASE_URL` usar
   senha padrão de desenvolvimento, ou existir usuário com senha fraca (`admin`, o próprio nome de usuário etc.).
   O motivo aparece no log do Render.
7. **Plano gratuito**: dorme após 15 min sem tráfego; o primeiro acesso depois leva 30–60 s. Enquanto dorme, o
   agendador de monitores da própria API não roda (mitigação: o tique do §7). Há um pool de 750 h por mês
   por conta, e um serviço acordado o mês todo (~720 h) cabe sozinho.

## 4. Site na Vercel

1. **Add New → Project**, escolha o repositório.
2. **Root Directory**: `apps/web`. Deixe ligado *Include source files outside of the Root Directory* (o site
   usa `packages/contracts`).
3. **Framework Preset**: Next.js. Install e Build vêm de `apps/web/vercel.json`:
   - install: `cd ../.. && corepack pnpm install --frozen-lockfile --filter @agora/web...`
   - build: `cd ../.. && corepack pnpm --filter @agora/contracts build && corepack pnpm --filter @agora/web build`
4. **Settings → General → Node.js Version**: `24.x`.
5. **Environment Variables** (Production **e** Preview):
   - `API_URL` = endereço da API no Render, `https://regua-api.onrender.com`, **sem barra no final**.
     Precisa existir **no build**: o `rewrites` do `next.config.mjs` lê esta variável ao compilar.
   - `ENABLE_EXPERIMENTAL_COREPACK` = `1` (o repositório fixa `pnpm@12.16.1` em `packageManager`).
6. Deploy. Copie o endereço final (`https://....vercel.app`) e coloque em `APP_ORIGIN` no Render (§3). O
   Render reinicia sozinho ao salvar a variável.

Pontos de atenção:

- **`output: 'standalone'`** no `next.config.mjs` agora só vale **fora** da Vercel (`process.env.VERCEL`):
  na Vercel a plataforma cuida da saída; o modo `standalone` serve à imagem Docker do VPS.
- **`experimental.proxyTimeout`** é do servidor próprio do Next e não vale na Vercel. Lá o proxy externo dos
  `rewrites` tem limite próprio (cerca de **120 s**, por documentação). A Busca com IA leva 30–100 s: cabe, no limite.
- **Plano Hobby é só para uso pessoal e não comercial.** Uso com clientes exige o plano Pro.
- **Origem**: a API só aceita escritas (POST/PUT/PATCH/DELETE) vindas de `APP_ORIGIN` (e `WEB_ORIGIN`, se
  definida). Endereços de *preview* da Vercel recebem 403 em ações de escrita. Use só o endereço de produção,
  ou coloque um segundo endereço em `WEB_ORIGIN` no Render.

## 5. Primeira conta de administrador

A tabela `users` nasce vazia. Crie a conta **do seu computador**, contra o banco da Neon, com senha forte
(mínimo 10 caracteres; `admin`/`admin` não é aceito em produção). A API precisa estar compilada.

PowerShell:

```powershell
corepack pnpm --filter @agora/contracts --filter @agora/db --filter @agora/domain --filter @agora/ingestion --filter @agora/api build
$env:DATABASE_URL = "postgres://agora_app:SENHA_APP@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require"
$env:SENHA_ADMIN = "uma-senha-forte-so-sua"
corepack pnpm --filter @agora/api user create meu.usuario --name "Seu Nome" --admin --password-env SENHA_ADMIN
Remove-Item Env:DATABASE_URL, Env:SENHA_ADMIN
```

(`DATABASE_URL` definida no terminal tem prioridade sobre a do `.env` local.) Depois, as demais contas se criam
pela tela **Administração** do próprio sistema.

## 6. GitHub

O projeto ainda não tem commits. Crie um repositório **privado** vazio no GitHub e:

```bash
git add -A
git status            # confira: .env NÃO pode aparecer (está no .gitignore)
git commit -m "Régua: primeira versão"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/regua.git
git push -u origin main
```

## 7. Coleta agendada e tique da API (GitHub Actions)

`.github/workflows/ingest.yml` roda a cada 6 h (e sob demanda): instala só o worker, coleta CE e PI do PNCP,
apaga `ingest_raw` com mais de 3 dias e chama `POST $API_URL/v1/internal/tick` (acorda a API e executa os
monitores). Segredos do repositório (*Settings → Secrets and variables → Actions*):

| Segredo | Valor |
|---|---|
| `DATABASE_URL` | URL **APP** da §2.2 |
| `API_URL` | endereço da API no Render, sem barra no final |
| `CRON_SECRET` | o mesmo do Render |

Teste: aba *Actions → ingest → Run workflow*. Custo: ~10–15 min por rodada ≈ 1.200–1.800 min/mês no cron de 6 h.
Repositório **público** não tem limite; **privado** no plano Free do GitHub tem 2.000 min/mês: se apertar, troque o
cron para `"17 */8 * * *"`. O passo do tique depende da rota `/v1/internal/tick` da API; sem ela, esse passo falha
com 404 e a coleta continua valendo.

## 8. Verificação

- [ ] `https://SUA-API.onrender.com/v1/healthz` → `{"status":"ok"}` (na 1ª vez pode demorar 60 s).
- [ ] Site abre e redireciona para `/login`.
- [ ] Login com a conta criada na §5.
- [ ] Radar mostra editais de CE e PI (depois da coleta); Buscador devolve resultados.
- [ ] Um edital com documentos: **Ler PDF do edital** abre o PDF.
- [ ] Chat de IA responde (30–100 s com a chave gratuita do Gemini).
- [ ] Administração: criar uma conta de teste, entrar com ela, excluir.
- [ ] Alterar senha funciona e encerra as outras sessões.
- [ ] Aba *Actions → ingest* terminou em verde.

## 9. Limites do plano gratuito, em resumo

| Limite | Efeito |
|---|---|
| Render dorme após 15 min | 1º acesso lento (30–60 s) |
| Monitores rodam dentro da API | só quando acordada; o tique do Actions cobre a cada 6 h |
| Neon: 1 GB, suspende parada | gravações falham se encher; a 1ª consulta após suspensão é mais lenta |
| Vercel Hobby | só uso não comercial; proxy externo ~120 s |
| Gemini gratuito | 30–100 s por busca com IA; pode dar 429/503 |
| Actions | 2.000 min/mês em repositório privado (Free) |

**Atualizar**: `git push` na `main`; Render e Vercel publicam sozinhos. Migration nova: rode `migrate` do PC
(§2.3) **antes** do push. **Logs**: Render (aba *Logs* do serviço), Vercel (*Logs* do projeto), GitHub (aba
*Actions*), Neon (*Monitoring*).

| Sintoma | O que olhar |
|---|---|
| API não sobe, log fala em "configuração insegura" | `APP_ORIGIN` (https), senha fraca de usuário, `COOKIE_SECURE` |
| Build do Render falha em `corepack`/`pnpm` | log do build; veja §10 |
| Site abre, mas o login dá erro de rede | `API_URL` na Vercel errada ou sem refazer o deploy depois de mudá-la |
| Ações de escrita dão 403 "Origem não permitida" | `APP_ORIGIN` diferente do endereço que você usa |
| Busca com IA estoura o tempo | API acordando (tente de novo) ou Gemini lento |
| "Erro interno" em tudo | `DATABASE_URL`, papéis/permissões (§2.2) e `sslmode=require` |

**Quando sair do gratuito**: assim que houver clientes (Vercel Hobby não permite), ou quando o primeiro acesso
lento incomodar, ou o banco passar de ~800 MB. O caminho é o VPS de `12-infra-deploy.md`.

## 10. O que não foi validado

Nenhum item abaixo foi testado; confira no primeiro deploy.

1. **Neon**: se o `ALTER DEFAULT PRIVILEGES` e o `GRANT agora_migrator TO CURRENT_USER` do `neon-setup.sql`
   são aceitos para o dono padrão; se as quatro extensões instalam sem pedir superusuário; se a Neon rejeita
   `statement_timeout` no pooler (por isso a URL direta).
2. **Render**: se `NODE_VERSION=24` (só a versão principal) é aceita ou exige versão completa; se `corepack enable`
   tem permissão no ambiente de build e baixa `pnpm@12.16.1`; se a memória do build gratuito basta para o
   `tsc` (por isso o install filtrado); que `NODE_ENV=development` só no install resolve o `typescript`.
3. **Vercel**: se aceita `corepack` com `ENABLE_EXPERIMENTAL_COREPACK=1` e Node 24; se `Root Directory` com
   `cd ../..` instala o workspace inteiro; se o `Origin` chega intacto à API pelo proxy dos `rewrites`
   (se não chegar, as escritas passam pelo ramo "sem Origin", que só bloqueia `Sec-Fetch-Site: cross-site`); se o
   IP real do usuário chega em `X-Forwarded-For` (limite por IP: 600 requisições/min por IP).
4. **GitHub Actions**: o `pnpm install --filter "@agora/worker..."` com `--frozen-lockfile`, e `psql` instalado no
   `ubuntu-latest` (costuma estar).
5. **`/v1/internal/tick`**: rota da API sendo criada à parte; o workflow assume o cabeçalho `x-cron-secret`.
6. **Cópia de dados (§2.4, Opção B)**: ordem e chaves estrangeiras do `pg_restore`.
