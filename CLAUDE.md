# Régua — contexto para o agente de código

Plataforma de gestão de licitações públicas com IA (busca de editais do PNCP, leitor de edital com citações, Kanban de pipeline, alertas). Nome: **Régua**. Referência funcional: LicitaHub (sem usar marca, textos ou imagens dele).

Este arquivo diz **como construir**. `docs/design/DESIGN.md` diz **como parecer**. As especificações completas estão em `docs/` (comece por `docs/README.md`).

## Regras que não se negociam

1. **Servidor autoritativo** (`docs/04`). O cliente envia intenções, nunca resultados. Identidade e organização vêm do token, nunca do corpo. Prazo, cota, preço, compatibilidade e permissão são calculados e checados no servidor. Toda mutação: `Idempotency-Key`, `If-Match` quando versionada, transação com outbox, resposta com o estado resultante.
2. **Contratos primeiro** (`docs/08`). Schemas zod `.strict()` em `packages/contracts`; OpenAPI e cliente gerados daí. O front não escreve tipos à mão. Erros em `application/problem+json` com `code` estável e `request_id`.
3. **Duas famílias de tabelas** (`docs/07`): públicas (PNCP, sem RLS, escritas só pelo worker) e de tenant (RLS por `org_id`, `FORCE ROW LEVEL SECURITY`). A aplicação conecta como `agora_app` (sem `BYPASSRLS`, não é dona das tabelas) e usa `SET LOCAL app.org_id` em toda transação. Migrations usam `agora_migrator`.
4. **Portas e adaptadores** (`docs/02` §4). O domínio nunca importa SDK de fornecedor. LLM só por `LlmGateway`; provedor, modelo e chave são dados no banco, nunca constantes no código (`docs/16`).
5. **Honestidade de status** (`docs/05` §8, `docs/06` §8). `429` ou erro de fonte nunca vira "nenhum resultado". Resultado vazio só quando as pernas responderam `ok`. `meta.degraded` informa degradação.
6. **IA é rascunho com citação** (`docs/09`, `docs/10` §4). Conteúdo de edital é dado não confiável: nunca instrução. Saída validada por schema; citação verificada contra os chunks enviados; sem trecho de suporte, "não consta no edital".
7. **LGPD na ingestão** (`docs/05` §10): descartar ou mascarar CPF e nome de pessoa física antes de indexar ou gerar embeddings.
8. **Nada de segredo em repositório, log ou trace.** Chaves de IA com criptografia em envelope (`docs/16` §4).

## Stack

TypeScript strict · NestJS sobre Fastify · PostgreSQL 17 (ParadeDB `pg_search` + `pgvector`) · BullMQ/Redis · BGE-M3 e reranker via TEI · Next.js (App Router) · Python só no `doc-processor` · OpenTelemetry. ADRs em `docs/03`.

## Estrutura

```
apps/api  apps/worker  apps/web  apps/doc-processor
packages/contracts  (a criar: domain, search-eval, ai-providers)
infra/docker  docs/
```

Fronteiras (`docs/02` §2–3): módulos só se falam por fachada (`index.ts`) ou evento; `packages/*` nunca dependem de `apps/*`.

## Comandos

```bash
pnpm install
pnpm db:up            # Postgres (ParadeDB, porta 5442) + Redis  | pnpm ml:up: TEI (embeddings/rerank)
pnpm --filter @agora/db migrate                       # aplica packages/db/migrations (papel agora_migrator)
pnpm --filter @agora/worker ingest open --pages 8     # carga real de propostas abertas do PNCP (12 chamadas/min)
pnpm build            # contracts primeiro (topológico)  | pnpm typecheck | pnpm test | pnpm lint
pnpm --filter @agora/api dev       # API em :3101
pnpm --filter @agora/web dev       # Web em :3000
```

pnpm via corepack (`packageManager` no `package.json`). Node 24. Copie `.env.example` para `.env`.

## Como trabalhar

- **Ordem de implementação** (`docs/13`): contracts → migrations + RLS → identity/organizations → conector PNCP + ingestão → busca lexical → vetorial + RRF → search-eval → API de busca → web → pipeline → billing → ai-providers → IA.
- **Antes de mexer em busca, índices, embeddings ou prompts**: rodar o conjunto de avaliação (`docs/06` §9, `docs/09` §10). Sem número medido, não há "melhorou".
- **Testes que provam a autoridade** (`docs/04` §10): contrato (campos extras rejeitados, `orgId`/`userId` ignorados), RLS (org A nunca lê org B; um teste percorre `pg_policies`), idempotência (2× = 1 efeito), concorrência (`409`), entitlements por plano.
- **Números são estimativa até a Fase 0 medir** (latência, volume, custo). Não os trate como requisito.
- **Decisões abertas** (`docs/15` §3): nuvem, pagamento, hospedagem do Postgres, AGPL do `pg_search`, SaaS × self-hosted, corpus jurídico. Enquanto abertas, use só as portas.

## UI

Ler `docs/design/DESIGN.md`, `tokens.css` e `regua.css` (componentes `rg-*`) antes de criar componente. Só tokens (nada de cor, espaço ou fonte soltos). Tema claro apenas; sem gradiente, emoji nem ícone em círculo colorido; vidro só em campos, popovers e barras flutuantes (`DESIGN.md`). Todo componente tem carregando, vazio, erro e degradado. A UI reflete o servidor, nunca calcula prazo, cota ou preço. Antes de entregar uma tela, rodar a taste skill (`.claude/skills/design-taste-frontend`): `lint.mjs --app` e `inspect.mjs --app`, em 1440/768/390px.

## Estilo de código

Biome (`pnpm lint`, `biome check --write .`). Aspas simples, 2 espaços, 100 colunas. Comentários só onde o porquê não é óbvio; referencie o doc (`docs/08 §2`) em vez de repetir a regra.
