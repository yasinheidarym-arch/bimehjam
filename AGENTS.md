# BimehJam — Codex Working Agreement

## Project map

- `src/`: React/Vite client.
- `server.ts` and `server/`: Express API and backend services.
- `prisma/schema.prisma`: SQLite Prisma data model.
- `Dockerfile`, `docker-compose.yml`, and `docker-entrypoint.sh`: production container configuration.

## Standard workflow

1. Inspect the smallest relevant area before editing. Preserve unrelated user changes.
2. Use `npm run verify` after repository/configuration changes. Use `npm run lint` for TypeScript changes and `npm run build` for release-oriented changes.
3. Keep `package-lock.json` authoritative. Do not switch package managers or edit lockfiles unless dependency changes require it.
4. Keep frontend and backend changes scoped; do not combine refactors with behavior fixes unless necessary.
5. A direct user request for an ordinary application or configuration change authorizes the full ordinary delivery path for that same change: validate, commit, push, deploy the named commit with `scripts/ops/deploy.sh`, and perform its health check. Report the outcome and deployed commit.

## Safety and secrets

- Never read, print, commit, or modify `.env*` files or credentials. Use variable names only when needed.
- Ordinary deploy authorization does not authorize Prisma migrations, `prisma db push`, seed commands, secret or environment-file access, data deletion, firewall or nginx changes, or other infrastructure changes. Each requires separate explicit approval.
- Normal container startup never migrates or seeds the database. Do not reintroduce automatic `prisma db push` or seed behavior in `docker-entrypoint.sh`.
- Do not use `docker compose down` in the ordinary deploy path. The approved deploy script rebuilds and restarts only the `app` service, then requires a successful health check.

## Database changes

- Treat `prisma/schema.prisma` as a high-impact contract. Explain intended data effects before proposing a schema change.
- Add reviewed migrations for schema changes; do not rely on `db push` as a migration workflow.
- A migration needs separate approval even when an ordinary deploy has been authorized. It must use `scripts/ops/migrate.sh` with an explicit commit and approver, which stops the app and creates an offline backup at `/opt/backups/bimehjam/sqlite` before `prisma migrate deploy`.
- Run `prisma generate` only when needed for changed schema/client code and only after the user has approved the associated database workflow.

## Validation

- `npm run verify` is static and read-only: it neither loads environment files nor calls Docker, Prisma CLI, or a database.
- If a validation step cannot be run, state the reason and give the next safe command.

## Production scripts

- `scripts/ops/deploy.sh --commit <sha>`: deploys only a clean, explicit commit reachable from `origin/main`; it does not migrate or seed data.
- `scripts/ops/rollback.sh --commit <sha>`: uses the same checked deploy path and always requires an explicit prior commit.
- `scripts/ops/backup-sqlite.sh`: creates an offline snapshot of the `bimehjam_data` volume at `/opt/backups/bimehjam/sqlite`; it refuses while the app is running.
- `scripts/ops/migrate.sh`: explicit-only path for approved migrations. Never run it under ordinary deploy authority.
