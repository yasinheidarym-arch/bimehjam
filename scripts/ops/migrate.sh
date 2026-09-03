#!/usr/bin/env bash
# Explicit-only migration path. Do not run without separate user approval.
set -euo pipefail

usage() {
  echo "Usage: $0 --commit <full-or-short-sha> --approved-by <name> [--baseline-existing-schema]" >&2
  exit 64
}

commit=""
approved_by=""
baseline_existing_schema=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit) commit="${2:-}"; shift 2 ;;
    --approved-by) approved_by="${2:-}"; shift 2 ;;
    --baseline-existing-schema) baseline_existing_schema=true; shift ;;
    *) usage ;;
  esac
done

[[ -n "$commit" && -n "$approved_by" ]] || usage
[[ -z "$(git status --porcelain)" ]] || { echo "Refusing migration: production worktree is not clean." >&2; exit 1; }

git fetch --quiet origin main
git cat-file -e "${commit}^{commit}"
git merge-base --is-ancestor "$commit" origin/main || { echo "Commit is not reachable from origin/main." >&2; exit 1; }
git switch --detach --quiet "$commit"

container_id="$(docker compose ps -a -q app)"
[[ -n "$container_id" ]] || { echo "Cannot resolve the app container for migration." >&2; exit 1; }
readonly SQLITE_VOLUME="$(docker inspect "$container_id" --format '{{range .Mounts}}{{if eq .Destination "/app/prisma"}}{{.Name}}{{end}}{{end}}')"
[[ -n "$SQLITE_VOLUME" ]] || { echo "Cannot resolve the SQLite volume mounted at /app/prisma." >&2; exit 1; }
image_id="$(docker compose images -q app 2>/dev/null || true)"
if [[ -z "$image_id" ]] || ! docker image inspect "$image_id" >/dev/null 2>&1; then
  image_ref="$(docker compose config --images | sed -n '1p')"
  image_id="$(docker image inspect --format '{{.Id}}' "$image_ref" 2>/dev/null || true)"
fi
[[ -n "$image_id" ]] || { echo "Migration image for app is not available; build the approved commit first." >&2; exit 1; }

# The production volume is historically mounted at /app/prisma and masks the
# versioned migration files shipped in the image. Mount the same SQLite volume
# at /data in an isolated one-shot container so schema/migrations remain those
# from the reviewed image. No application secrets or network access are used.
run_prisma_migrate() {
  docker run --rm --network none \
    --volume "${SQLITE_VOLUME}:/data" \
    --env DATABASE_URL="file:/data/dev.db" \
    "$image_id" npx prisma "$@"
}

echo "Approved migration requested by: $approved_by"
echo "Stopping application for an offline SQLite backup..."
docker compose stop app
restart_app() {
  docker compose up --detach --no-deps app >/dev/null 2>&1 || true
}
trap restart_app EXIT
"$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/backup-sqlite.sh"

if [[ "$baseline_existing_schema" == true ]]; then
  echo "Recording the reviewed existing-schema baseline without changing application tables..."
  run_prisma_migrate migrate resolve --applied 20260902000000_baseline_existing_schema
fi

echo "Running explicit Prisma migration for $(git rev-parse --short HEAD)..."
run_prisma_migrate migrate deploy
docker compose up --detach --no-deps app
trap - EXIT

echo "Migration command completed; run the deploy health check before declaring success."
