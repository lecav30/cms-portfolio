# Phase 1G controlled admin bootstrap validation

## Environment and scope

- Repository/path: `lecav30/cms-portfolio` at
  `/Users/lecav/Documents/own/sebastianlevano/cms`, branch `main`.
- Runtime: Node `v24.22.1` (nvm) and Bun `1.1.18`.
- Database: the pre-existing local-only Homebrew PostgreSQL 18 database
  `cms_portfolio_dev`, reached through loopback. No Neon, Vercel, or other
  provider resources were accessed.
- An ignored mode-`0600` `.env` supplied the local database connection,
  persistent Payload secret, local origin settings, and operator-controlled
  one-time bootstrap values. Values were neither displayed nor tracked.

## Live validation matrix

| Check | Result | Observed evidence |
| --- | --- | --- |
| Database target and readiness | PASS | PostgreSQL accepted connections; the selected database was `cms_portfolio_dev`. |
| Pre-bootstrap Users count | PASS | Count was `0` before the CMS first initialized. |
| One-time bootstrap | PASS | The first local startup created exactly one Users record. |
| Valid admin login | PASS | `POST /api/users/login` returned HTTP `200` using the controlled local credentials. |
| Invalid login | PASS | The same endpoint returned HTTP `401` for an intentionally invalid password. |
| Authenticated Users read | PASS | A Payload JWT issued by the successful login returned HTTP `200` for `GET /api/users`. |
| Anonymous Users read/create/update/delete | PASS | `GET`, `POST`, `PATCH`, and `DELETE` each returned HTTP `403`; the Users count remained `1`. |
| Admin route and no-index protection | PASS | `/admin` returned HTTP `200`; the Users API response carried `X-Robots-Tag: noindex, nofollow, noarchive`. A route response alone was not treated as proof of login. |
| Bootstrap removal | PASS | Only `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` were removed from the ignored local `.env`; its mode remained `0600`. |
| Restart without bootstrap inputs | PASS | CMS restarted with both bootstrap variables explicitly absent. The existing administrator's previously issued JWT still authorized `GET /api/users` (HTTP `200`), anonymous read remained HTTP `403`, and the Users count remained `1`. |
| Frozen dependency install | PASS | `bun install --frozen-lockfile` completed with no lockfile changes. |
| Typecheck | PASS | `bun run typecheck` completed successfully. |
| Lint | PASS | `bun run lint` completed successfully. |
| Production build | PASS | `bun run build` completed with the genuine local configuration and bootstrap variables unset. |

The post-restart authorization test uses Payload's JWT authentication mechanism,
which avoids retaining a password in shell history or output. The password-based
login was exercised before the one-time bootstrap inputs were removed. No
credentials, session cookies, JWTs, request bodies, or temporary auth files
remain in the repository; temporary files used during the test were removed.

## Database and migration notes

This task made no schema changes and generated or applied no migration. The
existing development schema was used only after confirming this was the named
local development database. The established strategy remains: local Payload
Postgres schema synchronization only for disposable development targets, then
reviewed, committed explicit migrations for production before deployment.

## Files and repository hygiene

- Added this report only. No application code or dependency versions changed.
- `.env` is ignored and was verified as untracked; no secret-bearing file or
  generated authentication artifact was staged.
- `git diff --check` passed before staging. No remote push was performed.

## Phase 2 decision

**READY.** Phase 1's local database, first-admin bootstrap, authentication,
authorization, and restart/non-repetition evidence is complete. Phase 2 may
add the editorial model and its reviewed migrations. Production still requires
its own Neon target, Vercel environment configuration, and a reviewed migration
deployment procedure; those are deliberately outside this local validation.
