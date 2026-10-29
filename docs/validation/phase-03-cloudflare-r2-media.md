# Phase 3 Cloudflare R2 media storage

## Summary

Phase 3 adds the official `@payloadcms/storage-s3` adapter pinned at `3.89.0`,
matching Payload and its other official packages. The adapter uses Cloudflare
R2's S3-compatible API from the CMS server and applies only to `media`.

The storage mode is explicit:

- Development with `R2_ENABLED=false` (or unset) keeps the ignored local
  filesystem path for Media and remains usable without cloud credentials.
- `R2_ENABLED=true` requires a complete R2 configuration and uses S3 storage
  with local upload storage disabled.
- `NODE_ENV=production` with R2 disabled or incomplete fails at startup. There
  is no production fallback to Vercel's ephemeral filesystem.

The adapter stores keys beneath `media/`. A generated `media.prefix` field
keeps the object path stable across local/R2 modes. It uses a configured public
base URL for API `url` values, so the S3 endpoint is used only for server-side
object operations and never appears as a public asset URL.

## Files changed

- `src/storage/r2.ts` — validated storage selection, R2 endpoint/public URL
  guards, S3 adapter configuration, and safe custom-domain URL generation.
- `src/payload.config.ts` — installs the storage plugin.
- `src/migrations/20261029_032843_phase_03_r2_media_prefix.*` — reviewed
  additive `media.prefix` migration and snapshot; `src/migrations/index.ts`
  registers it.
- `scripts/validate-r2-config.ts` and `package.json` — non-secret static
  configuration regression check.
- `.env.example` and `README.md` — variable names, local/R2 selection,
  provisioning, public hostname, CORS/cache, cleanup, and migration guidance.
- `bun.lockb`, generated Payload types, and Payload admin import map — matching
  dependency and generated artifacts.

## Required operator provisioning

No R2 account, bucket, API token, custom hostname, or DNS setting was created
by this task. Before live validation, an operator must provide these names in
an ignored local environment file for an isolated development/test bucket:

- `R2_ENABLED=true`
- `R2_BUCKET`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BASE_URL`

The endpoint must be `https://<account-id>.r2.cloudflarestorage.com`. Create a
Cloudflare R2 S3 API token with Object Read/Write scope restricted to that one
bucket. Do not use a production bucket or credentials. Attach the intended
public hostname separately: the planned production hostname is
`https://media.sebastianlevano.com`, but it has not been verified or assumed.

For public production delivery, connect the custom hostname to the R2 bucket in
the correct Cloudflare zone, wait for active ownership/TLS status, and configure
GET/HEAD and cache rules there. Keep the S3 endpoint private. Current uploads
are server-side; if presigned browser uploads are later enabled, configure R2
CORS for exact allowed origins, `PUT`, and required headers only.

## Security and storage behavior

- R2 credentials are server-only and no R2 variable has a `NEXT_PUBLIC_`
  prefix. The configuration reads no credentials into client code.
- `R2_ENDPOINT` must be an HTTPS Cloudflare R2 API origin; the public base URL
  must be a separate pathless HTTPS origin.
- Media remains authenticated-only for create, update, and delete. Anonymous
  Media reads expose only the already intentional public metadata. Posts retain
  their published-only query constraint, including direct-ID, filter, depth,
  and draft query protections.
- The existing JPEG/PNG/WebP/AVIF/GIF allow-list, disabled remote URL pasting,
  and 5 MiB Payload request limit remain in effect. Payload's upload path
  validates detectable media from file data and sanitizes filenames; SVG/HTML
  are not allowed.
- The adapter uploads replacements before deleting old objects and deletes on
  Media deletion. Cloud-side deletion is not live-tested; monitor for orphaned
  objects if a provider error interrupts cleanup.
- R2 public delivery makes uploaded objects public by URL. Do not upload assets
  that must remain embargoed or private. No direct browser upload is configured.

## Schema and migration handling

The Phase 3 migration contains only:

```sql
ALTER TABLE "media" ADD COLUMN "prefix" varchar DEFAULT 'media';
```

Its generated down migration drops the column and was reviewed but not run.
The existing `cms_portfolio_dev` database continues to use Payload development
schema synchronization. A protected schema-only snapshot was made before that
development-only local change, and the existing administrator was preserved.
`bun run migrate:status` will show the Phase 2 baseline and Phase 3 migration
as pending on that push-managed local database; neither was applied there.

For a fresh production database, review and apply the Phase 2 baseline once,
then this Phase 3 migration. Do not apply either to the current local
push-managed database and do not use migration reset/fresh/down commands against
shared or production data.

## Validation matrix

| Check | Result | Evidence |
| --- | --- | --- |
| Dependency compatibility | PASS | `@payloadcms/storage-s3` is pinned at `3.89.0`; Payload peer requirement is the same exact version. |
| Static R2 selection and URL validation | PASS | `bun run validate:r2-config` covered disabled development, production fail-fast, incomplete enabled config, valid configuration, safe object URL construction. |
| Production fail-fast without R2 | PASS | Configuration-only production command failed with `R2_ENABLED=true is required in production. Refusing local media storage.` |
| Production build wiring | PASS (static) | `bun run build` succeeded with non-secret placeholder R2 values; it made no cloud request. |
| Generated types / import map / typecheck / lint | PASS | Regenerated successfully; `bun run typecheck` and `bun run lint` passed. |
| Local development schema synchronization | PASS | `media.prefix` is present; Users count remained `1`. |
| R2-disabled local media and editorial regression | PASS | Existing `bun run validate:editorial` passed on loopback; MIME rejection, local upload/read/delete cleanup, publication lifecycle, and anonymous restrictions all remained intact. |
| Real R2 upload / retrieve / post relationship / replace / delete | BLOCKED | No R2 variables or isolated test bucket credentials were present. No cloud resource was contacted. |
| Public custom hostname retrieval / DNS / cache / CORS | BLOCKED | `media.sebastianlevano.com` and an R2 test public hostname are not configured or verified. |
| Migration application | NOT RUN | Phase 3 migration was generated and reviewed only; it was not applied with the migration runner to the local push-managed database. |

The 5 MiB CMS request limit remains above Vercel's documented roughly 4.5 MiB
server-upload limit. This is a deployment limitation, not a claim that a
5 MiB upload will work through Vercel. Server-side uploads deliberately avoid
exposing storage credentials; any future direct-upload design must use
authenticated presigned URLs and an explicit R2 CORS policy.

## Phase 4 handoff

**Phase 4 readiness: NOT READY for live-media integration.** The CMS code and
local fallback are ready, but the portfolio must not consume production Media
URLs until an isolated R2 test bucket has passed upload, retrieval, reference,
replacement, and deletion validation; the public hostname/DNS/cache path is
active; and production migration application has been rehearsed on a fresh
database. The public portfolio routes themselves remain outside this task.
