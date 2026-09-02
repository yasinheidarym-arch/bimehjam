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

## Safety and secrets

- Never read, print, commit, or modify `.env*` files or credentials. Use variable names only when needed.
- Do not run `docker compose up`, `docker compose restart`, `docker compose down`, deploy commands, or production commands without explicit user approval.
- Do not run Prisma migrations, `prisma db push`, `prisma migrate *`, seed commands, or any database-mutating command without explicit user approval.
- The current container entrypoint invokes `prisma db push`; therefore, building an image is not permission to run the resulting container.

## Database changes

- Treat `prisma/schema.prisma` as a high-impact contract. Explain intended data effects before proposing a schema change.
- Add reviewed migrations for schema changes; do not rely on `db push` as a migration workflow.
- Run `prisma generate` only when needed for changed schema/client code and only after the user has approved the associated database workflow.

## Validation

- `npm run verify` is static and read-only: it neither loads environment files nor calls Docker, Prisma CLI, or a database.
- If a validation step cannot be run, state the reason and give the next safe command.
