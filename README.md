# Régua

Gestão de licitações públicas com IA: encontre editais do PNCP, entenda cada um com citações e acompanhe prazos num pipeline.

- Contexto para agentes e regras do projeto: [`CLAUDE.md`](CLAUDE.md)
- Especificações: [`docs/`](docs/README.md) · Design: [`docs/design/DESIGN.md`](docs/design/DESIGN.md)
- **Manual do usuário** (como usar cada módulo): [`docs/manual/`](docs/manual/README.md)
- Roadmap: [`docs/13-roadmap-mvp.md`](docs/13-roadmap-mvp.md)

## Começar

```bash
corepack enable          # ou use qualquer pnpm >= 12
pnpm install
cp .env.example .env
pnpm db:up               # Postgres (ParadeDB: pg_search + pgvector) e Redis
pnpm build && pnpm test
pnpm --filter @agora/api dev     # http://127.0.0.1:3101/v1/health
pnpm --filter @agora/web dev     # http://localhost:3000
```

Embeddings e reranker (opcional, baixa modelos): `pnpm ml:up`.

## Estado

Etapa 0 concluída: monorepo, `@agora/contracts`, API com `/v1/health` e erros `problem+json`, esqueletos de worker e web com os tokens do design, `docker compose` com extensões verificadas, CI. Próximo: Fase 0 (conector PNCP, medições, conjunto de avaliação), em [`docs/13`](docs/13-roadmap-mvp.md).
