#!/bin/sh
set -e

echo "🚀 [Bimeh Jam] Starting production container initialization..."

# The application may use its mounted SQLite data directory, but a normal start
# must never create, migrate, push, or seed database state.
mkdir -p /app/prisma

echo "🟢 [Bimeh Jam] Starting application without database migration or seed actions."
exec "$@"
