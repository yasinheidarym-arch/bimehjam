#!/usr/bin/env bash
# Creates an offline snapshot of the named production SQLite volume before an approved migration.
set -euo pipefail

readonly BACKUP_DIR="/opt/backups/bimehjam/sqlite"
readonly ARCHIVE="bimehjam-sqlite-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"

[[ $# -eq 0 ]] || { echo "Usage: $0" >&2; exit 64; }
command -v docker >/dev/null || { echo "Missing required command: docker" >&2; exit 1; }

container_id="$(docker compose ps -a -q app)"
[[ -n "$container_id" ]] || { echo "Cannot resolve the app container for SQLite backup." >&2; exit 1; }
readonly VOLUME="$(docker inspect "$container_id" --format '{{range .Mounts}}{{if eq .Destination "/app/prisma"}}{{.Name}}{{end}}{{end}}')"
[[ -n "$VOLUME" ]] || { echo "Cannot resolve the SQLite volume mounted at /app/prisma." >&2; exit 1; }

if docker compose ps --status running --services | grep -qx app; then
  echo "Refusing backup: stop the app explicitly before taking an offline SQLite snapshot." >&2
  exit 1
fi

install -d -m 700 "$BACKUP_DIR"
docker run --rm --network none \
  --volume "${VOLUME}:/source:ro" \
  --volume "${BACKUP_DIR}:/backup" \
  alpine:3.20 \
  sh -eu -c "test -f /source/dev.db && cd /source && tar -czf /backup/${ARCHIVE} dev.db dev.db-wal dev.db-shm 2>/dev/null || tar -czf /backup/${ARCHIVE} dev.db"

echo "SQLite backup created: ${BACKUP_DIR}/${ARCHIVE}"
