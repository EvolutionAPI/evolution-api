# Repository Guidelines

## Project Structure & Module Organization
- `src/` – TypeScript source. Key areas: `api/controllers`, `api/routes`, `api/services`, `api/integrations/{channel,chatbot,event,storage}`, `config`, `utils`, `exceptions`.
- `prisma/` – Prisma schema and migrations. Provider folders: `postgresql-migrations/`, `mysql-migrations/`. Use `DATABASE_PROVIDER` to target the provider.
- `dist/` – Build output; do not edit.
- `public/` – Static assets.
- `Docker*`, `docker-compose*.yaml` – Local stack and deployment helpers.

## Build, Test, and Development Commands
- `npm run build` – Type-check (tsc) and bundle with `tsup` to `dist/`.
- `npm run start` – Run dev server via `tsx src/main.ts`.
- `npm run dev:server` – Watch mode for local development.
- `npm run start:prod` – Run compiled app from `dist/`.
- `npm run lint` / `npm run lint:check` – Auto-fix and check linting.
- Database (choose provider): `export DATABASE_PROVIDER=postgresql` (or `mysql`), then:
  - `npm run db:generate` – Generate Prisma client.
  - `npm run db:migrate:dev` – Apply dev migrations and sync provider folder.
  - `npm run db:deploy` – Apply migrations in non-dev environments.
  - `npm run db:studio` – Open Prisma Studio.
- Docker: `docker-compose up -d` to start local services.

## Coding Style & Naming Conventions
- TypeScript, 2-space indent, single quotes, trailing commas, 120-char max (Prettier).
- Enforced by ESLint + Prettier; import order via `simple-import-sort`.
- File names follow `feature.kind.ts` (e.g., `chat.router.ts`, `whatsapp.baileys.service.ts`).
- Classes: PascalCase; functions/variables: camelCase; constants: UPPER_SNAKE_CASE.

## Testing Guidelines
- No formal suite yet. Place tests under `test/` as `*.test.ts`.
- Run `npm test` (watches `test/all.test.ts` if present). Prefer fast, isolated unit tests.

## Commit & Pull Request Guidelines
- Conventional Commits enforced by commitlint. Use `npm run commit` (Commitizen).
  - Examples: `feat(api): add message status`, `fix(route): handle 404 on send`.
- PRs: include clear description, linked issues, migration impact (provider), local run steps, and screenshots/logs where relevant.

## Security & Configuration
- Copy `.env.example` to `.env`; never commit secrets.
- Set `DATABASE_PROVIDER` before DB commands; see `SECURITY.md` for reporting vulnerabilities.

