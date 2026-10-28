# Phase 1E admin bootstrap and authentication validation

## Environment and preconditions

- Repository/path: `lecav30/cms-portfolio` at
  `/Users/lecav/Documents/own/sebastianlevano/cms`, branch `main`.
- Runtime: Node `v24.22.1` selected through nvm and Bun `1.1.18`.
- Local PostgreSQL 18 was accepting loopback connections. The existing local
  `cms_portfolio_dev` database was queried read-only and contained zero Users
  records before this run.
- `.env` and `.env.local` were absent. Both are correctly ignored by Git.
  No controlled `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` values were
  securely supplied, so no administrator was created or modified.

## Validation matrix

| Check | Result | Observed evidence |
| --- | --- | --- |
| Node/Bun version | PASS | Node `v24.22.1`; Bun `1.1.18`. |
| PostgreSQL readiness | PASS | Local loopback PostgreSQL accepted connections. |
| Initial Users count | PASS | Read-only query confirmed zero users. |
| Frozen install | PASS | `bun install --frozen-lockfile` completed with no changes. |
| Typecheck | PASS | `bun run typecheck` completed successfully. |
| Lint | PASS | `bun run lint` completed successfully. |
| Build without required configuration | EXPECTED FAIL | `bun run build` stopped at the `DATABASE_URL` guard; no fallback credentials exist. |
| Build with process-scoped local configuration | PASS | `bun run build` completed using the actual local database target and a generated non-persisted secret. |
| First-admin bootstrap | BLOCKED | No controlled credentials were present; no account was invented. |
| Auth login / invalid login / authenticated Users API | BLOCKED | These require the controlled bootstrap account. |
| Bootstrap removal and restart non-repetition | BLOCKED | Depends on a completed initial bootstrap. |
| Unauthenticated REST denial in this run | BLOCKED | No server was started without a stable authentication secret. The preceding local-runtime validation independently observed HTTP 403 for Users GET/POST/PATCH/DELETE. |

## Actual bootstrap contract

The existing `onInit` hook reads `INITIAL_ADMIN_EMAIL` and
`INITIAL_ADMIN_PASSWORD` only when the Users count is zero. It creates one user
with `overrideAccess: true`; all Users REST operations otherwise require an
authenticated user. This run did not alter that behavior.

To resume this validation, the operator must privately create an ignored local
`.env` (or `.env.local`) in the repository root. Do not paste its values into
chat or shell history. It needs these exact names:

- `DATABASE_URL` — loopback connection to the existing `cms_portfolio_dev`
  database.
- `PAYLOAD_SECRET` — a unique high-entropy value that remains unchanged for
  both test starts.
- `NEXT_PUBLIC_SERVER_URL` and `CORS_ORIGINS` — exact local loopback origin.
- `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` — controlled credentials
  for this one empty local database only.

After the first startup creates the account, remove both `INITIAL_ADMIN_*`
entries while preserving the database URL and Payload secret. The follow-up
test must then restart Payload, prove login with the same account, observe an
authenticated Users request, observe unauthenticated/invalid-auth denial, and
confirm the user count remains one. Cookies, tokens, URLs with credentials,
passwords, and secret values must not be printed or committed.

## Security and readiness

No credentials, environment files, users, schema changes, migrations, or
production resources were created by this run. The previously validated
anonymous Users protection and no-index headers remain source/runtime evidence
from Phase 1D; this report does not relabel them as fresh authentication tests.

**Phase 2 status: NOT READY.** The sole remaining Phase 1 blocker is a real
controlled bootstrap/login/restart test. No remote Git push was performed.
