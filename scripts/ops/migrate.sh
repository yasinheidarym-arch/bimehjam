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
  docker compose run --rm --no-deps app \
    npx prisma migrate resolve --applied 20260902000000_baseline_existing_schema
fi

echo "Running explicit Prisma migration for $(git rev-parse --short HEAD)..."
docker compose run --rm --no-deps app npx prisma migrate deploy
docker compose up --detach --no-deps app
trap - EXIT

echo "Migration command completed; run the deploy health check before declaring success."
