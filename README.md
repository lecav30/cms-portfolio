# Sebastian Levano CMS

Standalone Payload CMS for `cms.sebastianlevano.com`. This is a separate
repository and Vercel project from the public portfolio. Phase 2 adds the
editorial model, published-only REST reads, and an opt-in Cloudflare R2 media
adapter. Public blog pages remain a later phase.

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

## Editorial model and REST API

Payload uses native drafts and versions for `Posts`; `_status` is Payload's
internal `draft` / `published` field, not a custom status field. Creating or
updating a post as a draft saves its editable version. Publish by setting
`_status` to `published`; unpublish by setting it back to `draft`. The first
publish sets `publishedAt`, and later edits or re-publication preserve it.

| Collection | Public REST reads | Authenticated REST writes | Notes |
| --- | --- | --- | --- |
| `posts` | Only `_status=published` documents | Create, update, publish, unpublish, delete | Versions and draft reads require authentication. |
| `categories` | Yes | Create, update, delete | Public fields are name, slug, description, and timestamps. |
| `tags` | Yes | Create, update, delete | Public fields are name, slug, and timestamps. |
| `media` | Yes | Upload, update, delete | Only image metadata and the upload URL are modelled; do not upload embargoed assets. |
| `users` | No | Authenticated-only | No public registration or listing. |

Examples of the future portfolio read contract:

```text
GET /api/posts?where[slug][equals]=mi-articulo&depth=2
GET /api/posts/:id
GET /api/categories
GET /api/tags
GET /api/media/:id
```

Anonymous Posts access is constrained in Payload access control before caller
filters are applied. Therefore direct IDs, `draft=true`, depth/population, and
`where[_status]=draft` do not bypass the published-only rule. GraphQL is
disabled because REST is the intended integration contract for this project.

`title` / `name` values are normalized to lower-case, accent-free URL slugs.
Slugs have database-backed uniqueness; collisions are rejected rather than
receiving random suffixes. A deliberate slug change changes the future public
URL, so Phase 4 must supply redirects for old portfolio URLs.

### Media storage: local development or Cloudflare R2

`Media` accepts JPEG, PNG, WebP, AVIF, and GIF only. Payload validates the
configured MIME allow-list server-side, including type detection from file data;
SVG and HTML are not accepted. Payload also sanitizes filenames before creating
storage keys. The request limit remains 5 MiB and remote URL pasting is disabled.

`R2_ENABLED=false` (or unset) explicitly selects the ignored local `media/`
directory for development only. The application refuses to start in production
unless `R2_ENABLED=true` and every R2 variable below is present and valid, so a
Vercel deployment cannot silently write persistent media to its ephemeral
filesystem.

When enabled, the official `@payloadcms/storage-s3` adapter uses Cloudflare
R2's S3 API server-side. It stores objects under the `media/` prefix and sets
`disableLocalStorage` for the collection. The API endpoint is never returned as
an asset URL: `R2_PUBLIC_BASE_URL` generates media URLs instead. The planned
production value is `https://media.sebastianlevano.com`; it is not assumed to
exist yet.

Required server-side R2 variables are:

- `R2_ENABLED=true`
- `R2_BUCKET`
- `R2_ENDPOINT` — `https://<account-id>.r2.cloudflarestorage.com`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BASE_URL` — public custom hostname without a path, never the API endpoint

Provision a dedicated development/test bucket first. Create an R2 S3 API token
restricted to Object Read/Write for that bucket only, then add its credentials
only to the ignored local environment or Vercel encrypted environment settings.
Do not expose these values with a `NEXT_PUBLIC_` name. For production, attach
`media.sebastianlevano.com` as an active R2 custom domain in the Cloudflare zone
and configure public read delivery there; the S3 API endpoint remains private.
The Cloudflare-managed `r2.dev` host is suitable only for isolated testing, not
production delivery.

This CMS uses server-side uploads, not direct browser PUT uploads, so bucket
CORS does not need to allow writes today. If a future phase introduces
presigned client uploads, configure only exact allowed origins, `PUT`, and the
required request headers; never use wildcard write origins. Configure public
GET/HEAD behavior and caching at the R2 custom domain. A public bucket cannot
list its root, but every uploaded object should still be considered public.

The storage adapter uploads a replacement before deleting the old object and
deletes objects after Media document deletion. Failed cloud deletion is logged
by the adapter and may leave an orphan requiring bucket lifecycle monitoring.
The current 5 MiB application limit is above Vercel's documented server-upload
ceiling of roughly 4.5 MiB; direct server uploads near that size need deployment
validation before production use.

To run the local editorial integration validation after a local administrator
exists, start the CMS on an unused loopback port and run:

```bash
CMS_TEST_ORIGIN=http://127.0.0.1:3011 bun run validate:editorial
```

It creates temporary editorial fixtures using the existing admin's local access
context, tests public REST behavior, then removes the fixtures in a `finally`
cleanup block. It does not print credentials or retain content.

Run the static storage-selection checks with:

```bash
bun run validate:r2-config
```

## Database and migration workflow

The project uses the official `@payloadcms/db-postgres` adapter with
`DATABASE_URL`. Payload's Postgres adapter uses Drizzle push mode during local
development, so use only a disposable local database or isolated Neon branch.
It does **not** run migrations automatically at production startup.

After completing a reviewed schema change in development:

1. Generate and review a versioned migration: `bun run migrate:create`.
2. Commit the generated `src/migrations/` files with the config change.
3. Review the generated `up` and `down` SQL. In particular, down migrations
   can be destructive and are never an automatic rollback plan.
4. Check a target database without changing it: `bun run migrate:status`.
5. In a deployment environment that can reach the intended database, run
   `bun run migrate` before the build. `bun run build:with-migrations` is an
   explicit convenience command, not the default `build` command.

The committed `phase_02_editorial_collections` migration is a **baseline**
generated after Phase 1 development schema push. It creates the Phase 1 and
Phase 2 Payload tables for a new empty database. Do not run it against an
existing push-managed local database: local development continues to use
Payload's development-only schema synchronization. Before first production
deployment, apply the reviewed baseline once to a fresh Neon database, record
it in `payload_migrations`, and use only subsequent reviewed migrations. Never
combine an unreviewed schema push with production migration application.

`phase_03_r2_media_prefix` follows that baseline and adds the Media object-key
prefix field. It is pending in the existing push-managed local database and was
not applied through the migration runner there. A fresh production database
must apply the reviewed Phase 2 baseline and then this Phase 3 migration in
order; never apply either baseline migration to the existing local development
database.

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

No Vercel, Neon, DNS, R2 bucket, R2 credentials, public media hostname, or
public portfolio blog integration has been provisioned by this repository.
