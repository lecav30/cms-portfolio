# Phase 1 CMS validation

## Scope and environment

- Repository: `cms-portfolio` at `/Users/lecav/Documents/own/sebastianlevano/cms`.
- Branch: `main`; remote: `origin` points to
  `https://github.com/lecav30/cms-portfolio.git` (not pushed during validation).
- Package manager: Bun `1.1.18` with tracked `bun.lockb`. Bun 1.1 uses the
  binary lockfile name; the lockfile was accepted by `bun install
  --frozen-lockfile` without changes.
- Local Node: `v24.14.1`. This is below the application engine floor
  (`>=24.22.1 <25`) and must be upgraded before treating local runtime testing
  as representative of deployment.
- No `.env` file or required environment variables were present. No values were
  inspected or recorded.

## Checks

| Check | Outcome | Evidence |
| --- | --- | --- |
| `bun install --frozen-lockfile` | Pass | 559 installs / 673 packages checked; no changes. |
| `bun run typecheck` | Pass | `tsc --noEmit` exited successfully. |
| `bun run lint` | Pass | ESLint exits successfully after the compatible flat-config correction. |
| `bun run build` | Pass with non-secret validation-only environment | `next build` compiled successfully and emitted `/admin/[[...segments]]`, `/api/[...slug]`, and `/robots.txt`. No database connection was attempted or claimed. |
| Database connectivity, schema push/migrations | Blocked | `DATABASE_URL` is not configured; no unidentified database was contacted. |
| Admin bootstrap/login and REST HTTP behavior | Blocked | No disposable database or authorized bootstrap/existing-admin credentials are configured. |

The build was run with an intentionally invalid local Postgres endpoint and a
validation-only secret, supplied only to satisfy required configuration during
compile time. They are not stored in this repository or an environment file.

## Corrections made

1. `eslint.config.mjs` now consumes the flat config exported by the pinned
   `eslint-config-next` directly. The previous import from `eslint/config` is
   unavailable in pinned ESLint `9.16.0`, causing lint to fail before files were
   checked.
2. The `build` script now runs `next build`. Payload `3.89.0` does not expose a
   `payload build` CLI command, while the matching official template uses Next's
   build command.

No dependency versions changed, and the existing Bun lockfile remains valid.

## Security and database review

- `DATABASE_URL` and `PAYLOAD_SECRET` are required at startup.
- The official Postgres adapter is configured with `DATABASE_URL`, a dedicated
  migration directory, and a documented Neon `sslmode=require` expectation.
- `Users` create/read/update/delete/admin/unlock operations require an
  authenticated user; anonymous registration and user listing are denied.
- First-admin creation only occurs for an empty database when both
  `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` are explicitly provided;
  those variables must be removed immediately after bootstrap.
- CORS and CSRF are exact-origin lists, not wildcards. `/admin` and `/api` have
  `X-Robots-Tag: noindex, nofollow, noarchive`, and `robots.txt` disallows them.
- `.gitignore` excludes local `.env` files while retaining `.env.example`.
  The tracked files include no local environment file or real credential.

## Remaining actions before Phase 2

**NOT READY for Phase 2 integration testing** until the following are complete:

1. Upgrade local Node to `>=24.22.1 <25`.
2. Provide a disposable local Postgres database or isolated Neon branch, plus a
   unique `PAYLOAD_SECRET` and controlled one-time bootstrap credentials.
3. Validate development schema push, migration generation/status, `/admin`
   bootstrap/login, anonymous `Users` read/create denial, and authenticated
   admin behavior against that disposable database.
4. Keep production migrations reviewed and explicit; do not use destructive
   migration commands on a shared database.

The static application baseline, lockfile, lint, typecheck, and production
compile are ready for the database-backed validation above.
