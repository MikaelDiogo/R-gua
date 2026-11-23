#!/usr/bin/env bash
# Restaura um backup feito por backup.sh. DESTRUTIVO: substitui os dados atuais do banco.
#   infra/scripts/restore.sh /var/backups/agora/agora-AAAA-MM-DD-HHMMSS.dump [--yes]
# Teste a restauração num servidor de teste todo mês (docs/12 §5).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/docker-compose.prod.yml" --env-file "$ROOT/.env")
file="${1:-}"
[ -n "$file" ] && [ -f "$file" ] || { echo "uso: $0 <arquivo.dump> [--yes]" >&2; exit 2; }

if [ "${2:-}" != "--yes" ]; then
  read -r -p "Isto APAGA o banco atual e restaura '$file'. Digite 'restaurar' para continuar: " ans
  [ "$ans" = "restaurar" ] || { echo "cancelado"; exit 1; }
fi

echo "Parando api, worker e web (para não escreverem durante a restauração)..."
"${COMPOSE[@]}" stop web api worker

echo "Restaurando..."
# --clean --if-exists recria os objetos; --exit-on-error para na primeira falha.
"${COMPOSE[@]}" exec -T postgres pg_restore -U postgres -d agora --clean --if-exists --exit-on-error <"$file"

echo "Subindo os serviços..."
"${COMPOSE[@]}" up -d
echo "ok: restauração concluída. Confira o login e a busca."
