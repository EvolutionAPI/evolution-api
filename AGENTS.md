# Evolution API — Agent Guide

WhatsApp multi-tenant API platform. Node.js 20+, TypeScript, Express.js, Prisma (PostgreSQL/MySQL).

## Commands (verified from package.json/CI)

| Command | What it does |
|---|---|
| `npm run dev:server` | Hot-reload dev server (tsx watch) |
| `npm start` | Run with tsx |
| `npm run build` | `tsc --noEmit && tsup` — typecheck then bundle (CJS+ESM) |
| `npm run lint` | ESLint auto-fix |
| `npm run lint:check` | ESLint check only (CI runs this) |
| `npm run commit` | Interactive Commitizen commit |
| `npm test` | `tsx watch ./test/all.test.ts` — no real suite exists |
| `npm run db:generate` | Prisma client gen (uses runWithProvider.js) |
| `npm run db:migrate:dev` | Dev migration + sync to provider folder |
| `npm run db:deploy` | Production migration deploy |

**CI pipeline** (`.github/workflows/check_code_quality.yml`): `npm ci` → `npm run lint:check` → `npm run db:generate` → `npm run build`

**Pre-push hook runs**: `npm run build && npm run lint:check`

## Database

- `DATABASE_PROVIDER=postgresql|mysql|psql_bouncer` — must be set **before** any db:* script
- Schema files: `prisma/{postgresql,mysql,psql_bouncer}-schema.prisma`
- Migrations: `prisma/{postgresql,mysql}-migrations/`
- `runWithProvider.js` replaces `DATABASE_PROVIDER` placeholder in generated commands
- Path aliases work (`@api/*`, `@config/*`, etc.) — defined in tsconfig paths

## Architecture

- Entry point: `src/main.ts` — Express bootstrap, Sentry init, instance loading
- Route wiring: `src/api/routes/index.router.ts` — each `.use()` call mounts a `RouterBroker` subclass
- DI wiring: `src/api/server.module.ts` — manual instantiation of all services/controllers (no DI framework)
- Validations: JSONSchema7 schemas in `validate/` + RouterBroker's `dataValidate()`
- DTOs: plain classes (no decorators) in `src/api/dto/`
- Instance auth guard chain: `instanceExistsGuard → instanceLoggedGuard → authGuard['apikey']`
- Event bus: EventEmitter2 for internal events; WebSocket/RabbitMQ/SQS/NATS/Pusher for external

## Important non-obvious facts

- `"strict": false` and `"strictNullChecks": false` in tsconfig (existing docs are wrong about strict mode)
- `experimentalDecorators: true` / `emitDecoratorMetadata: true` are on despite DTO docs saying "no decorators"
- Build output goes to `dist/` — tsup produces both CJS and ESM, minified with sourcemaps
- Translations are copied from `src/utils/translations` → `dist/translations` during build
- There are **no tests** — `npm test` watches a non-existent suite
- Path aliases require `tsconfig-paths` at runtime
- `husky`, `lint-staged`, `commitlint` enforce commit conventions on commit and push
- Class-validator is in dependencies but **not used** — all validation uses JSONSchema7
- Baileys version is pinned: `"baileys": "7.0.0-rc.9"`

## References

- `.cursor/rules/` — detailed specialized rules for services, controllers, DTOs, routes, guards, integrations
- `CLAUDE.md` — alternative agent guide with project overview and patterns
- `.cursor/rules/core-development.mdc` — fundamental dev principles
- `.cursor/rules/project-context.mdc` — project-specific constraints and patterns
- Language requirement (from `.cursor/rules/`): user communication in Portuguese (PT-BR), code in English
