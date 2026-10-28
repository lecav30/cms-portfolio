# Phase 1C runtime validation

## Execution environment

- Repository and path: `cms-portfolio`,
  `/Users/lecav/Documents/own/sebastianlevano/cms`.
- Initial Git state: clean `main`, one local commit ahead of `origin/main`.
  The remote is `https://github.com/lecav30/cms-portfolio.git`.
- Runtime found: Node `v24.14.1` and Bun `1.1.18`. Node is below the declared
  application requirement `>=24.22.1 <25`; no alternate Node installation was
  available for a safe local switch.
- Locked versions: Payload / `@payloadcms/next` / `@payloadcms/db-postgres`
  `3.89.0`, Next `16.3.4`, React `19.2.8`, and TypeScript `5.7.3`.
- `bun.lockb` is tracked and accepted by frozen Bun 1.1 installation.
- No `.env` file was present. `DATABASE_URL`, `PAYLOAD_SECRET`,
  `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`, `NEXT_PUBLIC_SERVER_URL`,
  and `CORS_ORIGINS` were unset. No values were inspected or recorded.

## Validation matrix

| Check | Result | Evidence |
| --- | --- | --- |
| `bun install --frozen-lockfile` | PASS | 559 installs / 673 packages checked with no changes. |
| `bun run typecheck` | PASS | `tsc --noEmit` exited successfully. |
| `bun run lint` | PASS | ESLint exited successfully. |
| `bun run build` with the actual environment | BLOCKED (expected) | Next compiled but stopped when the Payload API route required the missing `DATABASE_URL`. This confirms the required-environment guard remains active. |
| `bun run build` with validation-only non-secret values | PASS (compile only) | Next completed and emitted `/admin/[[...segments]]`, `/api/[...slug]`, and `/robots.txt`. The URL intentionally targeted an unavailable loopback port; this does not establish a database connection. |
| Local Postgres listener probe | BLOCKED | `pg_isready -h 127.0.0.1 -p 5432 -t 2` returned no response. |
| Payload migration CLI availability | PASS (command discovery only) | The pinned CLI lists `migrate`, `migrate:create`, `migrate:status`, `migrate:down`, `migrate:refresh`, `migrate:reset`, and `migrate:fresh` when supplied validation-only required configuration. No migration command was executed against a database. |
| Database connection, schema push, migrations | BLOCKED | No explicit disposable local database or isolated Neon development branch was configured. |
| Bootstrap, `/admin` login, and live REST authorization | BLOCKED | These require a known empty disposable database and controlled test credentials. |

No test script is configured in `package.json`.

## Security review versus live verification

Source review confirms that `Users` operations require authentication, public
registration is not enabled, `DATABASE_URL` and `PAYLOAD_SECRET` are required,
and local `.env*` files are ignored while `.env.example` remains tracked. CORS
and CSRF use configured origin lists, and admin/API routes are no-indexed.

These are source-review observations only. No HTTP status codes, cookies, user
records, bootstrap behavior, or authorization responses were tested against a
real database in this run.

## Database and migration status

Database target type: **none**. No local listener was available and no Neon
connection was supplied. Consequently, no schema was created, no development
push occurred, no migration was generated or reviewed, and no destructive
migration command was run.

For a future disposable-only run, the operator must provide:

1. Node `>=24.22.1 <25` (for example, install/select a matching Node 24 patch
   through the already-installed version manager; do not lower the project
   engine requirement).
2. A confirmed empty local Postgres database or isolated Neon development
   branch, with an appropriate TLS connection string for Neon.
3. An untracked `.env` with `DATABASE_URL`, a unique `PAYLOAD_SECRET`,
   `NEXT_PUBLIC_SERVER_URL=http://localhost:3000`, and exact local CORS origin.
4. Controlled one-time bootstrap credentials. Remove `INITIAL_ADMIN_*` from
   the environment immediately after the zero-user bootstrap test.

Only after confirming the target is disposable should the next validation run
start Payload, observe the development schema push, test first-admin creation
and login, remove bootstrap variables, test that it does not create another
admin, and capture unauthenticated REST denials for Users read/create/update/
delete without recording credentials or tokens. Generate and review a migration
separately before treating any production migration path as validated.

## Phase 2 readiness

**NOT READY.** Static checks and compile-only validation pass, but the runtime
environment is Node-incompatible and no authorized disposable database exists.
Database-backed startup, migrations, admin login, and negative REST security
tests remain mandatory blockers.
