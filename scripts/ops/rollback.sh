#!/usr/bin/env bash
# Roll back only to an explicit, already-pushed commit.
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec "$script_dir/deploy.sh" "$@"
