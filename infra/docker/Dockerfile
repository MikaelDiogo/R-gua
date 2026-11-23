# syntax=docker/dockerfile:1.7
# Imagens de produção do Régua (docs/12-infra-deploy.md). Contexto de build: raiz do repositório.
#   docker build -f infra/docker/Dockerfile --target node-runtime -t agora-node .   (api, worker, migrate)
#   docker build -f infra/docker/Dockerfile --target web-runtime  -t agora-web  .   (Next.js standalone)
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV npm_config_store_dir=/pnpm/store \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=true
# pnpm na versão fixada em `packageManager` (package.json), via corepack.
RUN corepack enable
WORKDIR /repo

# ── build: instala tudo e compila na ordem topológica (contracts → domain → db → ingestion → apps) ──
FROM base AS build
# Em /api/* o Next faz proxy para a API. O destino das rewrites é gravado no build.
ARG API_URL=http://api:3101
ENV API_URL=${API_URL}
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm build

# ── prod-deps: só dependências de produção de api/worker/db, sem devDependencies ──
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/ingestion/package.json packages/ingestion/
COPY packages/search-eval/package.json packages/search-eval/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts \
      --filter "@agora/api..." --filter "@agora/worker..." --filter "@agora/db..."

# ── node-runtime: api, worker e migrate usam a mesma imagem (o comando muda no compose) ──
FROM node:${NODE_VERSION}-bookworm-slim AS node-runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=prod-deps --chown=root:root /repo /repo
COPY --from=build /repo/packages/contracts/dist packages/contracts/dist
COPY --from=build /repo/packages/domain/dist packages/domain/dist
COPY --from=build /repo/packages/db/dist packages/db/dist
COPY --from=build /repo/packages/db/migrations packages/db/migrations
COPY --from=build /repo/packages/ingestion/dist packages/ingestion/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/worker/dist apps/worker/dist
# Usuário sem privilégios (já existe na imagem oficial do Node). Os arquivos são só de leitura para ele.
USER node
EXPOSE 3101
CMD ["node", "apps/api/dist/main.js"]

# ── web-runtime: Next.js em modo standalone (output: 'standalone' em next.config.mjs) ──
FROM node:${NODE_VERSION}-bookworm-slim AS web-runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
# Em monorepo o standalone põe o servidor em apps/web/; os estáticos ficam ao lado dele.
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["sh", "-c", "if [ -f apps/web/server.js ]; then exec node apps/web/server.js; else exec node server.js; fi"]
