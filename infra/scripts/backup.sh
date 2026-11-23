#!/usr/bin/env bash
# Backup lógico do banco (pg_dump -Fc) com retenção. Uso (a partir de qualquer pasta):
#   BACKUP_DIR=/var/backups/agora RETAIN_DAYS=14 infra/scripts/backup.sh
# Cron diário: veja docs/12-infra-deploy.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/docker-compose.prod.yml" --env-file "$ROOT/.env")
BACKUP_DIR="${BACKUP_DIR:-/var/backups/agora}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

stamp="$(date +%Y-%m-%d-%H%M%S)"
final="$BACKUP_DIR/agora-$stamp.dump"
tmp="$final.partial"
trap 'rm -f "$tmp"' EXIT

# -T: sem TTY (o cron não tem). O pg_dump roda dentro do contêiner, pelo socket local.
"${COMPOSE[@]}" exec -T postgres pg_dump -U postgres -d agora -Fc >"$tmp"

if [ ! -s "$tmp" ]; then
  echo "backup vazio: abortado" >&2
  exit 1
fi
mv "$tmp" "$final"
chmod 600 "$final"
trap - EXIT

# Retenção: apaga os mais antigos que RETAIN_DAYS dias.
find "$BACKUP_DIR" -maxdepth 1 -name 'agora-*.dump' -type f -mtime "+$RETAIN_DAYS" -print -delete

echo "ok: $final ($(du -h "$final" | cut -f1))"
