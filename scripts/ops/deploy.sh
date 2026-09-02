#!/usr/bin/env bash
# Run on the production checkout. This script never runs Prisma migrations or seeds.
set -euo pipefail

readonly REMOTE_REF="origin/main"
readonly SERVICE="app"
readonly HEALTH_URL="http://127.0.0.1:3000/api/webhook/health"
readonly HEALTH_ATTEMPTS=30
readonly HEALTH_INTERVAL_SECONDS=2

usage() {
  echo "Usage: $0 --commit <full-or-short-sha>" >&2
  exit 64
}

commit=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit) commit="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done

[[ -n "$commit" ]] || usage

for command in git docker curl; do
  command -v "$command" >/dev/null || { echo "Missing required command: $command" >&2; exit 1; }
done

[[ -f docker-compose.yml ]] || { echo "Run from the repository root containing docker-compose.yml." >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "Refusing deploy: production worktree is not clean." >&2; exit 1; }

git fetch --quiet origin main
git cat-file -e "${commit}^{commit}" || { echo "Unknown commit: $commit" >&2; exit 1; }
git merge-base --is-ancestor "$commit" "$REMOTE_REF" || {
  echo "Refusing deploy: $commit is not reachable from $REMOTE_REF." >&2
  exit 1
}

git switch --detach --quiet "$commit"

echo "Building application image for $(git rev-parse --short HEAD)..."
docker compose build "$SERVICE"

echo "Restarting only the application service..."
docker compose up --detach --no-deps "$SERVICE"

for ((attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt++)); do
  if curl --fail --silent --show-error "$HEALTH_URL" >/dev/null; then
    echo "Deploy healthy at commit $(git rev-parse --short HEAD)."
    exit 0
  fi
  sleep "$HEALTH_INTERVAL_SECONDS"
done

echo "Deploy failed health check after $((HEALTH_ATTEMPTS * HEALTH_INTERVAL_SECONDS)) seconds." >&2
exit 1
