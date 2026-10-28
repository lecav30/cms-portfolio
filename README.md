# Sebastian Levano CMS

Standalone Payload CMS foundation for `cms.sebastianlevano.com`. This is a separate
repository and Vercel project from the public portfolio. Phase 1 intentionally
contains only the authenticated `Users` collection; editorial collections, R2
storage, and public blog pages are later phases.

## Stack and prerequisites

- Payload `3.89.0` and its official Postgres / Next packages, all pinned to the
  same version.
- Next `16.3.4`, React / React DOM `19.2.8`, TypeScript `5.7.3`.
- Node.js `24.x` for Vercel production. Payload's current installation guide
  requires `^22.23.4 || >=24.22.1`; use a current Node 24 patch locally too.
- Bun `1.1.x` for installs and scripts. Bun manages dependencies only; the
  deployed Payload/Next application uses Vercel's Node.js 24 runtime.
- A dedicated, disposable local Postgres database or a dedicated Neon branch.
  Never point development push mode at shared or production data.

## Local setup

1. Copy `.env.example` to `.env` and replace every placeholder. `DATABASE_URL`
   must be a Postgres URL with `sslmode=require` for Neon. Generate a unique
   `PAYLOAD_SECRET` with `openssl rand -base64 48`.
2. Use a current Node 24 release and run `bun install`. Commit the resulting
   `bun.lock`; thereafter use `bun install --frozen-lockfile` for reproducible
   installs.
3. Start with `bun run dev`, then open `http://localhost:3000/admin`.
4. Run `bun run typecheck`, `bun run lint`, and `bun run build` before handoff.

### First administrator and subsequent accounts

There is no public signup endpoint. The `users` REST collection permits every
operation only to an authenticated user. On startup, `INITIAL_ADMIN_EMAIL` and
`INITIAL_ADMIN_PASSWORD` are read only if the database has **zero** users. That
one-time bootstrap creates the first administrator; remove both variables from
the environment immediately after seeing the startup confirmation, then sign in
at `/admin`. An authenticated administrator can create any later administrator
through the admin UI. Do not set the bootstrap variables in a shared production
environment after first use.

The CMS does not use wildcard CORS. Set `CORS_ORIGINS` to exact browser origins
only (for example, the final portfolio origin); server-to-server portfolio reads
do not need CORS. `NEXT_PUBLIC_SERVER_URL` is the exact CMS origin and supports
Payload's same-origin CSRF protection. `robots.ts` disallows `/admin/` and
`/api/`; this is not authentication and the collection access controls remain
the protection boundary.

## Database and migration workflow

The project uses the official `@payloadcms/db-postgres` adapter with
`DATABASE_URL`. Payload's Postgres adapter uses Drizzle push mode during local
development, so use only a disposable local database or isolated Neon branch.
It does **not** run migrations automatically at production startup.

After completing a reviewed schema change in development:

1. Generate and review a versioned migration: `bun run migrate:create`.
2. Commit the generated `src/migrations/` files with the config change.
3. Check a target database without changing it: `bun run migrate:status`.
4. In a deployment environment that can reach the intended database, run
   `bun run migrate` before the build. `bun run build:with-migrations` is an
   explicit convenience command, not the default `build` command.

Do not use `migrate:fresh`, `migrate:reset`, or `migrate:refresh` against any
shared or production database. Review generated SQL and take a backup before
running production migrations.

## Vercel handoff (later)

Create a separate Vercel project for this repository and select Node `24.x`.
Vercel detects `bun.lock` / `bun.lockb` and installs with Bun, while the deployed
Next/Payload functions still run on Node. Configure these encrypted environment
variables in the CMS project only:

- `DATABASE_URL` — the dedicated Neon production connection string, TLS enabled.
- `PAYLOAD_SECRET` — unique high-entropy production secret.
- `NEXT_PUBLIC_SERVER_URL=https://cms.sebastianlevano.com`.
- `CORS_ORIGINS=https://www.sebastianlevano.com` when a browser integration is
  intentionally introduced.

Bootstrap variables belong only in the controlled one-time initial deployment
and should then be removed. Configure the platform build command to explicitly
run reviewed migrations before `bun run build` only after verifying database
network access and the migration workflow in a non-production environment.

No Vercel, Neon, DNS, Cloudflare R2, media storage, posts, categories, tags,
draft workflow, or public portfolio blog integration is configured in Phase 1.
