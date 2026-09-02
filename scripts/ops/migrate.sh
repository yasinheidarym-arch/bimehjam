#!/usr/bin/env bash
# Explicit-only migration path. Do not run without separate user approval.
set -euo pipefail

usage() {
  echo "Usage: $0 --commit <full-or-short-sha> --approved-by <name>" >&2
  exit 64
}

commit=""
approved_by=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit) commit="${2:-}"; shift 2 ;;
    --approved-by) approved_by="${2:-}"; shift 2 ;;
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
"$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/backup-sqlite.sh"

echo "Running explicit Prisma migration for $(git rev-parse --short HEAD)..."
docker compose run --rm --no-deps app npx prisma migrate deploy
docker compose up --detach --no-deps app

echo "Migration command completed; run the deploy health check before declaring success."
