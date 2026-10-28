# Phase 1D local PostgreSQL runtime validation

## Environment and repository state

- Repository/path: `lecav30/cms-portfolio` at
  `/Users/lecav/Documents/own/sebastianlevano/cms`, branch `main`.
- Initial state: clean, with the prior Phase 1 commits local and no remote push
  performed by this validation.
- Runtime used for all checks: Node `v24.22.1` selected through the existing
  nvm installation, satisfying `>=24.22.1 <25`; Bun `1.1.18`.
- Locked dependencies: Payload / `@payloadcms/next` /
  `@payloadcms/db-postgres` `3.89.0`, Next `16.3.4`, React `19.2.8`, and
  TypeScript `5.7.3`. `bun.lockb` is tracked.
- PostgreSQL: existing Homebrew `postgresql@18` service was already running on
  loopback port 5432. It was not started, stopped, reconfigured, or otherwise
  changed by this validation.
- Database target: the user-designated local `cms_portfolio_dev` database.
  Authenticated loopback connectivity succeeded, and its public schema was
  confirmed empty before development initialization. The local role and
  connection URL are intentionally not recorded.
- No `.env` file was created. Each runtime process received a loopback-only
  database URL and a fresh `openssl rand` Payload secret through its process
  environment; neither was printed nor persisted. Bootstrap variables were not
  set.

## Validation matrix

| Check | Result | Evidence |
| --- | --- | --- |
| Node/Bun version | PASS | Node `v24.22.1`, Bun `1.1.18`. |
| Frozen dependencies | PASS | `bun install --frozen-lockfile` checked 559 installs / 673 packages without changes. |
| Local Postgres service and target connection | PASS | `postgresql@18` was started; `pg_isready` accepted loopback connections; authenticated `psql` connection to `cms_portfolio_dev` succeeded. |
| Target safety check | PASS | Public-schema table count was zero before Payload startup. No reset, drop, or destructive command was used. |
| Development schema initialization | PASS | Payload dev server loaded the database schema; public tables and an empty `users` table were then confirmed with read-only SQL. |
| `bun run typecheck` | PASS after fix | The generated Payload types exposed a widened collection slug in the bootstrap hook; preserving the literal `users` slug fixed the error. |
| `bun run lint` | PASS | ESLint exited successfully. |
| `bun run build` | PASS | Build used the real local process environment and emitted `/admin/[[...segments]]`, `/api/[...slug]`, and `/robots.txt`. |
| Migration status | PASS, no migrations | `bun run migrate:status` read `src/migrations` and reported no migrations. No SQL migration was generated, reviewed, or applied. |
| Local server startup | PASS | `bun run dev -- --hostname 127.0.0.1 --port 3010` started on loopback and was stopped with Ctrl-C after tests. |
| Root/admin/robots routes | PASS | `GET /`, `GET /admin`, and `GET /robots.txt` returned HTTP 200. Admin HTTP 200 only proves the login/admin route is served; it is not an authenticated login. |
| Unauthenticated Users REST protection | PASS | `GET /api/users`, `POST /api/users`, `PATCH /api/users/1`, and `DELETE /api/users/1` each returned HTTP 403. No user rows existed after the tests. |
| API no-index protection | PASS | A real `GET /api/users` response included `X-Robots-Tag: noindex, nofollow, noarchive`. |
| First-admin bootstrap and authenticated login | BLOCKED | No user-supplied controlled bootstrap credentials were available. No administrator was created, overwritten, or reset. |

## Schema and migration approach

Payload development startup initialized the empty, confirmed-disposable local
database through the configured Postgres development workflow. This validates
local development schema synchronization only. `src/migrations/.gitkeep` now
establishes the configured migration directory so status checks do not emit an
error before the first reviewed migration exists.

No production migration behavior has been tested. A future schema change must
generate, review, and commit its migration before it is considered eligible for
production; destructive migration commands remain out of scope.

## Security and administrator status

Live HTTP checks establish that the `Users` collection is not anonymously
readable or mutable. The database remains user-free. Source configuration
retains exact-origin CORS/CSRF, required environment variables, the no-public-
registration access policy, and no-index protections.

Admin bootstrap/login remains unverified, rather than inferred: a controlled
administrator email/password must be supplied through a secure local mechanism
for an empty disposable database. After bootstrap, remove `INITIAL_ADMIN_*`
from the process/environment, verify login without printing cookies/tokens,
and verify a restart cannot create a second administrator.

## Changes

- `src/collections/Users.ts` and `src/payload.config.ts`: use a shared literal
  `usersSlug` for Payload admin and bootstrap local API calls, fixing generated-
  type compatibility without changing access policy.
- `src/payload-types.ts`: generated from the validated Payload configuration.
- `src/migrations/.gitkeep`: creates the configured, tracked migration folder.
- `.gitignore`: ignores development-only agent instruction files generated by
  Next.js; no local environment file is tracked.
- This report records the local database-backed evidence.

## Phase 2 readiness

**NOT READY** for full Phase 2 handoff: the development database, schema
initialization, build, and negative REST checks are validated, but controlled
first-admin bootstrap/login remains untested and no reviewed migration has yet
been generated. Supply secure disposable-only bootstrap credentials to complete
that remaining Phase 1 runtime test. No production, Neon, Vercel, R2, portfolio,
or remote Git resource was changed.
