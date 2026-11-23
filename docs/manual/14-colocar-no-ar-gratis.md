# 14. Colocar o Régua na internet de graça

Este capítulo é para quem **nunca publicou um sistema**. Siga na ordem. Cada passo diz o que clicar. Os nomes de
botões nos sites podem mudar um pouco com o tempo: se não achar, procure por uma palavra parecida.

Se preferir a versão técnica, com todos os comandos e detalhes, leia `docs/deploy-gratuito.md`.

## O que você vai usar

Pense no Régua como uma loja com três partes. Cada parte mora num serviço gratuito diferente.

| Parte | Para que serve | Onde ela vai ficar |
|---|---|---|
| **O site** | O que as pessoas veem e clicam | **Vercel** |
| **O cérebro (API)** | Faz as contas, a busca e fala com a IA | **Render** |
| **O armazém (banco de dados)** | Guarda editais, contas e funil | **Neon** |
| **O carteiro** | Busca editais novos no PNCP várias vezes ao dia | **GitHub** (recurso "Actions") |
| **A estante do código** | Guarda o projeto para os outros serviços lerem | **GitHub** |

## O que o plano gratuito tem de ruim (leia antes)

- **O cérebro dorme.** Se ninguém usar por 15 minutos, ele "cochila". O próximo acesso demora de 30 a 60
  segundos para acordar. Depois fica rápido.
- **Os monitores só funcionam acordados.** O "carteiro" do GitHub acorda o sistema a cada 6 horas para isso.
- **O armazém tem 1 GB.** Chega para Ceará e Piauí por bastante tempo, mas não é infinito.
- **A Vercel gratuita é só para uso pessoal, sem fins comerciais.** Se for atender clientes, vai precisar do plano pago.
- **A IA com a chave gratuita do Gemini é lenta:** de 30 a 100 segundos por pergunta.

Quando isso incomodar, o caminho é um servidor próprio (VPS): `docs/12-infra-deploy.md`.

## Antes de começar, separe

- Um e-mail seu para criar as contas (use o mesmo nos quatro sites; entrar com a conta do **GitHub** facilita).
- As chaves que você já usa: `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` e `TAVILY_API_KEY`. Estão no
  arquivo `.env` do seu computador. **Nunca** mande esse arquivo para ninguém nem para o GitHub.
- Um bloco de notas aberto. Você vai anotar endereços e senhas ao longo do caminho.

**Senhas boas para as máquinas:** gere com letras e números, sem símbolos. No terminal: `openssl rand -hex 24`.
Cada vez que o texto pedir uma senha, gere uma nova e anote no bloco de notas com o nome dela.

---

## Passo 1. GitHub: guardar o projeto

1. Entre em **github.com** e crie uma conta (ou entre).
2. Clique em **New repository** (botão verde, ou o **+** no canto de cima).
3. Nome: `regua`. Marque **Private** (privado). **Não** marque "Add a README". Clique em **Create repository**.
4. No terminal, dentro da pasta do projeto, rode (troque `SEU_USUARIO`):

   ```
   git add -A
   git status
   git commit -m "Régua: primeira versão"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/regua.git
   git push -u origin main
   ```

5. Confira em `git status`: o arquivo **`.env` não pode aparecer** na lista. Se aparecer, pare e peça ajuda.
6. Atualize a página do repositório no GitHub: os arquivos devem estar lá.

## Passo 2. Neon: criar o armazém

1. Entre em **neon.com** e crie uma conta.
2. Crie um projeto (**Create project**). Nome: `regua`. Versão do Postgres: a mais nova (17).
3. Em **Region**, escolha **AWS US East 1 (N. Virginia)**. Parece estranho não escolher São Paulo, mas o armazém
   precisa ficar **perto do cérebro** (que ficará na Virgínia), e isso pesa mais na velocidade do que a distância até você.
4. Depois de criado, abra **Connect** (ou "Connection details"). Procure o endereço de conexão. Escolha a
   conexão **sem** "pooled" / "pooler" (a direta). Ela tem um endereço parecido com `ep-nome-numero.us-east-1.aws.neon.tech`.
   Anote o **host** (a parte `ep-...neon.tech`) e o nome do banco (geralmente `neondb`).
5. Abra o **SQL Editor** (menu da esquerda).
6. No seu computador, abra o arquivo `infra/hosted/neon-setup.sql` em um editor de texto. **Troque** os três textos
   `TROCAR_SENHA_MIGRATOR`, `TROCAR_SENHA_APP` e `TROCAR_SENHA_MAINT` por três senhas diferentes (do jeito
   explicado acima). Anote quais são. Use "Localizar e substituir" do editor: cada texto aparece mais de uma vez.
7. Copie o arquivo inteiro, cole no SQL Editor da Neon e clique em **Run**.
8. No final, o editor mostra duas tabelas: uma com **3 papéis** `agora_...` e outra com as **extensões**. Se
   aparecer erro vermelho, copie a mensagem e peça ajuda (não rode de novo sem entender).

Agora monte **dois endereços** e anote (troque o host e a senha de cada um):

```
ENDEREÇO DO MIGRATOR:
postgres://agora_migrator:SENHA_MIGRATOR@HOST_DA_NEON/neondb?sslmode=require

ENDEREÇO DO APP:
postgres://agora_app:SENHA_APP@HOST_DA_NEON/neondb?sslmode=require
```

## Passo 3. Criar as tabelas do sistema

No terminal do seu computador, na pasta do projeto (Windows, PowerShell):

```powershell
corepack pnpm install
corepack pnpm --filter @agora/db build
$env:MIGRATOR_DATABASE_URL = "COLE AQUI O ENDEREÇO DO MIGRATOR"
corepack pnpm --filter @agora/db migrate
Remove-Item Env:MIGRATOR_DATABASE_URL
```

Deve aparecer seis linhas `migration aplicada: 0001_...` até `0006_...`. Pronto: o armazém tem as prateleiras.

## Passo 4. Encher o armazém com editais

Ainda no PowerShell:

```powershell
corepack pnpm --filter @agora/domain --filter @agora/ingestion --filter @agora/worker build
$env:DATABASE_URL = "COLE AQUI O ENDEREÇO DO APP"
node apps/worker/dist/ingest.js open --pages 8 --ufs CE,PI
Remove-Item Env:DATABASE_URL
```

Leva uns 10 a 15 minutos (o PNCP só aceita 12 pedidos por minuto). Ele escreve na tela o que foi buscando. Não feche.

## Passo 5. Render: ligar o cérebro (API)

1. Entre em **render.com** e crie uma conta (entre com o GitHub).
2. Clique em **New +** e depois **Blueprint**.
3. Conecte sua conta do GitHub se pedir e escolha o repositório `regua`. O Render encontra o arquivo `render.yaml`.
4. Ele mostra o serviço **regua-api** e pede alguns valores. Preencha:

   | Campo | O que colocar |
   |---|---|
   | `DATABASE_URL` | O **ENDEREÇO DO APP** do Passo 2 |
   | `APP_ORIGIN` | Deixe por enquanto algo como `https://temporario.vercel.app`. Você troca no Passo 7 |
   | `CRON_SECRET` | Uma senha nova (gerada como acima). **Anote**, você usa de novo no Passo 8 |
   | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | Os valores do seu `.env` |
   | `TAVILY_API_KEY` | O valor do seu `.env` |

5. Clique em **Apply** / **Create**. O primeiro "build" demora alguns minutos. Acompanhe na aba **Logs**.
6. Quando terminar, copie o endereço do serviço (algo como `https://regua-api.onrender.com`) e anote como **ENDEREÇO DA API**.
7. Teste: abra no navegador `ENDEREÇO DA API/v1/healthz`. Deve aparecer `{"status":"ok"}`. Na primeira vez pode
   levar 1 minuto: é ele acordando.

Se o build falhar, abra o Logs, copie as últimas linhas vermelhas e peça ajuda. As causas mais comuns estão em
"Se algo der errado" no fim.

## Passo 6. Vercel: publicar o site

1. Entre em **vercel.com** e crie uma conta (entre com o GitHub).
2. Clique em **Add New… → Project** e escolha o repositório `regua`.
3. Antes de clicar em Deploy, ajuste:
   - **Root Directory**: clique em **Edit** e escolha `apps/web`. Deixe ligada a opção
     "Include source files outside of the Root Directory".
   - **Framework Preset**: Next.js (normalmente já vem certo).
   - **Environment Variables**, adicione duas:
     - `API_URL` = o **ENDEREÇO DA API** do Passo 5 (sem barra `/` no final).
     - `ENABLE_EXPERIMENTAL_COREPACK` = `1`
4. Clique em **Deploy** e espere.
5. Quando terminar, a Vercel mostra o endereço do site (algo como `https://regua-xxxx.vercel.app`). Anote como **ENDEREÇO DO SITE**.
6. Se o build reclamar da versão do Node: em **Settings → General → Node.js Version**, escolha **24.x** e faça
   um novo deploy (**Deployments → ⋯ → Redeploy**).

## Passo 7. Avisar o cérebro qual é o endereço do site

1. Volte ao **Render**, abra o serviço `regua-api`, aba **Environment**.
2. Edite `APP_ORIGIN` e coloque o **ENDEREÇO DO SITE** (com `https://`, sem barra no final). Salve.
3. O Render reinicia sozinho. Espere ele ficar "Live".

Sem este passo, você consegue ver as telas, mas **não consegue salvar nada** (o cérebro recusa pedidos de endereços desconhecidos, para sua segurança).

## Passo 8. O carteiro (coleta automática)

1. No GitHub, abra o repositório `regua` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Crie três segredos (um de cada vez):

   | Nome | Valor |
   |---|---|
   | `DATABASE_URL` | O **ENDEREÇO DO APP** |
   | `API_URL` | O **ENDEREÇO DA API** |
   | `CRON_SECRET` | A senha que você anotou no Render (a **mesma**) |

3. Abra a aba **Actions**. Se pedir, clique em "I understand my workflows, enable them".
4. Escolha **ingest** na lista da esquerda e clique em **Run workflow** → **Run workflow**. Uma bolinha amarela vira
   verde quando terminar (10 a 15 minutos).
5. Dali em diante ele roda sozinho a cada 6 horas.

Se for um repositório privado, o GitHub dá 2.000 minutos grátis por mês. Esta tarefa gasta uns 1.200 a 1.800.
Se acabar o limite, edite o arquivo `.github/workflows/ingest.yml` e troque `*/6` por `*/8` ou `*/12`.

## Passo 9. Criar a sua conta de administrador

O sistema nasce sem nenhuma conta. Crie a sua no PowerShell (escolha **seu usuário** e uma **senha forte**, com
no mínimo 10 caracteres; `admin` / `admin` **não** funciona na internet):

```powershell
corepack pnpm --filter @agora/db --filter @agora/domain --filter @agora/ingestion --filter @agora/api build
$env:DATABASE_URL = "COLE AQUI O ENDEREÇO DO APP"
$env:SENHA_ADMIN = "sua-senha-forte-aqui"
corepack pnpm --filter @agora/api user create seu.usuario --name "Seu Nome" --admin --password-env SENHA_ADMIN
Remove-Item Env:DATABASE_URL, Env:SENHA_ADMIN
```

Usuário: minúsculas, números, ponto, hífen e sublinhado (de 3 a 32 caracteres).

Depois, as contas das outras pessoas você cria **dentro do sistema**: menu **Administração** (capítulo 11).

## Passo 10. Testar tudo

Abra o **ENDEREÇO DO SITE** e confira, marcando cada item:

- [ ] A página de entrada aparece.
- [ ] Você entra com a conta do Passo 9. (Na primeira vez pode demorar 1 minuto: o cérebro acordando.)
- [ ] O **Radar** mostra editais de Ceará e Piauí.
- [ ] O **Buscador** acha editais quando você digita uma palavra, por exemplo `notebook`.
- [ ] Em um edital, o botão **Ler PDF do edital** abre o PDF.
- [ ] O **Chat de IA** responde (espere até 100 segundos).
- [ ] Em **Administração**, você cria uma conta de teste, entra com ela e depois exclui.
- [ ] Em **Alterar senha**, a troca funciona.

## Como atualizar depois

Mexeu no projeto? No terminal: `git add -A`, `git commit -m "o que mudou"` e `git push`. Render e Vercel
publicam sozinhos em alguns minutos. Se a mudança incluir um arquivo novo em `packages/db/migrations`, rode
antes o **Passo 3** de novo.

## Como ver o que está acontecendo (logs)

- **Cérebro:** Render → `regua-api` → **Logs**.
- **Site:** Vercel → projeto → **Logs**.
- **Carteiro:** GitHub → aba **Actions** → clique na rodada.
- **Armazém:** Neon → **Monitoring**.

## Se algo der errado

| O que você vê | O que fazer |
|---|---|
| O cérebro não liga e o Logs fala em "configuração insegura" | `APP_ORIGIN` precisa começar com `https://`; nenhum usuário pode ter senha fraca |
| O site abre, mas o login dá erro de rede | `API_URL` na Vercel está errada. Corrija e faça **Redeploy** (ela só vale no deploy) |
| Dá para ver as telas, mas ao salvar aparece "Origem não permitida" | `APP_ORIGIN` no Render é diferente do endereço do site que você está usando (Passo 7) |
| Tudo dá "Erro interno" | Confira o `DATABASE_URL` e rode o Passo 2 até o fim (os papéis e as permissões) |
| A primeira página demora 1 minuto | É normal no plano gratuito: o cérebro estava dormindo |
| A busca com IA demora muito ou falha | A chave gratuita do Gemini é lenta; tente de novo |
| O armazém encheu (1 GB) | Rode `infra/hosted/limpar-ingest-raw.sql` no SQL Editor da Neon |
| O build no Render ou na Vercel falha por causa de `corepack`/`pnpm`/Node | Copie a mensagem e peça ajuda: pode ser a versão do Node (precisa ser 24) |

## Quando sair do plano gratuito

- Vai atender clientes (a Vercel gratuita não permite uso comercial).
- O primeiro acesso lento virou problema.
- O armazém passou de uns 800 MB.

Nesse caso, passe para um servidor próprio (VPS) seguindo `docs/12-infra-deploy.md`.

## Limites conhecidos

- Nada deste capítulo foi testado numa publicação real. Os passos seguem a documentação dos serviços e os
  arquivos do projeto; no primeiro deploy, anote qualquer diferença e corrija o texto.
- Os nomes de menus e botões dos sites externos mudam com o tempo.
- A rota que o carteiro chama para acordar o cérebro (`/v1/internal/tick`) é de outra frente de trabalho; se
  ela não existir, esse último passo da rodada falha, mas a coleta de editais continua valendo.
