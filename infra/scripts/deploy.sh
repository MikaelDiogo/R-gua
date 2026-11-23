#!/usr/bin/env bash
# Atualiza e sobe o Régua no VPS: git pull, build, migrations, up e espera ficar saudável.
#   infra/scripts/deploy.sh [--no-pull]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
[ -f .env ] || { echo "falta o .env (copie de .env.production.example)" >&2; exit 1; }
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env)

if [ "${1:-}" != "--no-pull" ]; then
  git pull --ff-only
fi

echo "==> build das imagens"
"${COMPOSE[@]}" build

echo "==> banco e Redis"
"${COMPOSE[@]}" up -d postgres redis

echo "==> migrations (papel agora_migrator)"
# `run` garante que roda a cada deploy (um serviço one-shot já concluído não reexecuta sozinho).
"${COMPOSE[@]}" run --rm migrate

echo "==> subindo todos os serviços"
"${COMPOSE[@]}" up -d --remove-orphans

wait_healthy() {
  local svc="$1" tries=60 id status
  id="$("${COMPOSE[@]}" ps -q "$svc")"
  [ -n "$id" ] || { echo "serviço $svc não está rodando" >&2; return 1; }
  while [ "$tries" -gt 0 ]; do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")"
    case "$status" in
      healthy | running) echo "   $svc: $status"; return 0 ;;
      unhealthy | exited | dead) break ;;
    esac
    tries=$((tries - 1))
    sleep 5
  done
  echo "   $svc NÃO ficou saudável (último estado: ${status:-desconhecido})" >&2
  "${COMPOSE[@]}" logs --tail 60 "$svc" >&2 || true
  return 1
}

echo "==> aguardando saúde"
for s in postgres api web caddy; do wait_healthy "$s"; done

echo "ok: Régua no ar. Lembre: backup diário (infra/scripts/backup.sh) e senha do admin trocada."
