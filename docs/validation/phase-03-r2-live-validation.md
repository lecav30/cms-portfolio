# Phase 3B: live Cloudflare R2 media validation

## Result

**Phase 4 readiness: READY, with production-environment prerequisites.**

An operator-provisioned, isolated R2 development bucket and its public HTTPS
hostname were configured only in the ignored local `.env` file. The CMS
successfully exercised the complete Media object lifecycle against that bucket:
authenticated server-side creation, R2 object inspection, public retrieval,
replacement, deletion, and fixture cleanup. No Cloudflare resources, DNS
records, provider accounts, or production databases were changed by this
validation.

## Environment and configuration

- Repository: `lecav30/cms-portfolio`, branch `main`.
- Runtime used: Node `v24.22.1`, Bun `1.1.18`.
- CMS: Payload `3.89.0`, Next.js `16.3.4`, and
  `@payloadcms/storage-s3` `3.89.0`.
- Database: the existing local PostgreSQL 18 development database
  `cms_portfolio_dev`; its existing administrator was retained.
- Storage target: an operator-provisioned development/test R2 bucket. Bucket
  identity and credentials are intentionally omitted.
- The configured public custom hostname is active and passed DNS/TLS/object
  delivery checks. It is not yet the planned production origin
  `https://media.sebastianlevano.com`; that hostname remains a deployment
  follow-up.
- `.env` was confirmed Git-ignored and mode `0600`. Its values were never
  printed. The variable names used were `R2_ENABLED`, `R2_BUCKET`,
  `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and
  `R2_PUBLIC_BASE_URL`, alongside the existing private CMS database and
  Payload settings.

`R2_ENABLED=true` selected the S3 adapter. Its endpoint stayed server-only;
the public API response used the custom public hostname and `media/` object
prefix. The validation did not enable direct browser uploads or expose S3
credentials.

## Live test method

`scripts/validate-r2-live.ts` creates collision-resistant PNG fixture names
through Payload's authenticated Local API using the existing local
administrator. It verifies R2 objects using the S3 client already installed by
the official storage adapter, makes unauthenticated requests only to the CMS's
intentionally public Media read endpoint, and cleans only those generated
fixture keys. It records neither credentials, object URLs, document IDs, nor
session material.

The test also asserts that the local `media/` directory has the same file count
before and after the R2-enabled lifecycle. This confirms that this CMS run did
not depend on local filesystem upload storage.

## Validation matrix

| Check | Result | Observed evidence |
| --- | --- | --- |
| Local PostgreSQL target and R2 configuration | PASS | `pg_isready` succeeded; a read-only identity check returned `cms_portfolio_dev`; `resolveR2Configuration()` accepted the private configuration. |
| Frozen dependency install | PASS | `bun install --frozen-lockfile` checked 713 installs / 827 packages with no changes. |
| Typecheck and lint | PASS | `bun run typecheck` and `bun run lint` completed successfully. |
| Static R2 storage guards | PASS | `bun run validate:r2-config` passed the development-local selection, production fail-fast, incomplete-R2 rejection, and safe URL construction cases. |
| Local Payload startup | PASS | Next/Payload started bound to `127.0.0.1:3011`; `/admin` and `/api/media` both returned HTTP 200. |
| Authenticated Media upload and R2 object existence | PASS | The Local API created an allowed PNG; a direct S3 `HeadObject` confirmed the `media/` object and `image/png` content type. |
| Public hostname, DNS/TLS, and delivery | PASS | The uploaded public HTTPS URL returned HTTP 200 and `image/png`; no S3 API endpoint was used as the public URL. |
| Anonymous Media read | PASS | `GET /api/media/:id` returned HTTP 200 for the intended public metadata and custom public URL. |
| Anonymous Media mutation denial | PASS | `POST`, `PATCH`, and `DELETE` against Media each returned HTTP 403. |
| Invalid MIME rejection | PASS | An authenticated Local API attempt to upload `text/html` was rejected by Payload's file restrictions. |
| Oversized request rejection | PASS | An unauthenticated multipart request exceeding 5 MiB returned HTTP 413. |
| Authenticated Media read | PASS | The existing administrator successfully read the fixture through Payload's access-controlled Local API. |
| Replacement lifecycle | PASS | A replacement PNG created a different `media/` key; the new object existed, its public HTTPS URL returned HTTP 200 and `image/png`, and the old key returned not-found on direct object inspection. |
| Deletion and fixture cleanup | PASS | Payload Media deletion removed the replacement object; final cleanup rechecked every fixture key as absent. |
| R2-enabled editorial regression | PASS | `bun run validate:editorial` passed, including temporary Media/Post cover-image relation handling, published-only Post reads, draft non-disclosure, unauthorized writes, and cleanup. |
| Production build with real local configuration | PASS | `bun run build` completed successfully. It validates build wiring, not a production deployment. |
| Migration runner application | NOT RUN | The development database remains Payload push-managed. Both the Phase 2 baseline and additive Phase 3 `media.prefix` migration remain pending by design and were not applied to this existing database. |

The Payload logger's expected rejection messages for the deliberately invalid
HTML fixture and its development-only no-email-adapter warning were observed.
The oversized multipart request correctly returned HTTP 413, but the Next
development server also logged Payload's size-limit exception as an
`unhandledRejection`; the server remained usable for the subsequent editorial
regression. Treat that noisy development-mode logging as an upstream/runtime
behavior to monitor rather than a successful-upload path.

## Database and migration notes

No schema migration or destructive database operation was performed. The
read-only migration status continues to show these reviewed migrations as
pending on the existing push-managed local database:

- `20261029_025459_phase_02_editorial_collections`
- `20261029_032843_phase_03_r2_media_prefix`

Do not run that baseline against `cms_portfolio_dev`. For a fresh production
database, review and apply the baseline once, then the additive Phase 3
migration, after rehearsing the procedure on a separate fresh database.

## Files changed

- `scripts/validate-r2-live.ts` — repeatable, redacted live R2 fixture
  lifecycle validation and cleanup.
- `package.json` — adds `bun run validate:r2-live`.
- `docs/validation/phase-03-r2-live-validation.md` — this evidence-backed
  report.

No application storage configuration needed correction during live validation.
No credential, `.env`, fixture media file, database dump, or provider setting
is tracked.

## Remaining risks and Phase 4 handoff

- The configured development hostname passed an HTTPS object fetch. Bind and
  validate the planned `media.sebastianlevano.com` hostname before production,
  then configure long-lived cache rules deliberately and retest after any
  Cloudflare rule change.
- The current 5 MiB CMS request limit exceeds Vercel's roughly 4.5 MiB
  server-upload limit. Keep uploads below Vercel's limit or design an
  authenticated presigned-upload flow in a later phase; do not expose R2
  credentials to the browser.
- Payload/Next development mode logs the correctly rejected oversized multipart
  request as an `unhandledRejection`. Recheck this behavior on future Payload
  or Next upgrades and observe production logs after deployment.
- This validates the isolated development bucket only. Production still needs
  its own least-privilege credentials, public-hostname binding, Vercel
  environment configuration, and a rehearsed fresh-database migration run.
- The portfolio implementation remains a separate Phase 4 task. It can now
  consume published CMS content and Media URLs after its own integration,
  caching, and deployment validation.

## Git

This report, the validation script, and its package script are committed by
the local Phase 3B validation commit. No push is performed.
