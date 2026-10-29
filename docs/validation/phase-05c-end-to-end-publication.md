# Phase 5C — end-to-end publication and cache revalidation

## Result

**READY for Phase 6 local development.** The local CMS, durable Payload jobs
queue, signed portfolio receiver, and public portfolio pages were exercised as
one flow. This does not certify deployed production infrastructure.

## Local topology

- CMS repository: `main` at `348cbde` before this validation.
- Portfolio repository: read-only `develop` at `c08715f` before this validation.
- Node `v24.22.1`, Bun `1.1.18`, Payload `3.89.0`, Next.js `16.3.4`.
- CMS: `http://127.0.0.1:3111`; portfolio: `http://127.0.0.1:3100`.
- CMS used the existing local PostgreSQL development database. R2 was not
  needed because the fixture post had no media.
- Both processes received an in-memory shared `BLOG_REVALIDATION_SECRET`.
  The CMS sender used the local `PORTFOLIO_REVALIDATION_URL`; the portfolio
  received a local, server-only `PAYLOAD_CMS_URL`. No ignored environment file
  was changed and no values are recorded here.

The receiver accepted the CMS sender's HMAC-SHA256 contract: a hex signature of
the exact UTF-8 bytes `<unix-seconds>.<raw JSON body>`, sent in the Phase 5A
headers. Successful deliveries returned `204`.

## Observed end-to-end behavior

The harness created two uniquely prefixed Categories and one Post with Payload's
Local API, while all public assertions used real HTTP requests to the CMS REST
API and the running portfolio. It manually ran only that fixture's
`blog-revalidation` queue jobs. This was intentional: Local API calls have no
Next request `after()` scope, so the durable queue was exercised directly rather
than treating a manually signed receiver request as proof of the sender path.

| Action | Durable-job / receiver result | Public result |
| --- | --- | --- |
| Save a new draft | No revalidation job was queued. | Anonymous CMS detail and `/blog/[draft-slug]` both returned `404`. |
| Publish | A `publish` job was queued. After recovery, it delivered `204`. | `/blog`, `/blog/[slug]`, and the category page returned `200` and contained the fixture. |
| Edit a published title | An `update` job delivered `204`. | Detail HTML showed the updated title and no longer showed the prior title. |
| Move slug and category | An `update` job delivered `204` with previous locations. | Old detail returned `404`; new detail returned `200`; the old category no longer listed the post and the new category did. |
| Unpublish | An `unpublish` job delivered `204`. | Detail and listing no longer exposed the post; anonymous CMS detail returned `404`. |
| Republish | A `publish` job delivered `204`. | New detail returned `200` again. |
| Delete | A `delete` job delivered `204`. | The detail returned `404` and the listing omitted the post. |

Cache assertions used bounded polling rather than assuming the first
post-invalidation request is fresh. This accounts for the receiver's
`revalidateTag(tag, "max")` stale-while-revalidate behavior. Each expected
state became visible during the bounded local assertion window. The existing
five-minute cached-fetch fallback remains in place; Phase 5C does not claim
instant freshness or static generation, because the portfolio root layout uses
`cookies()` and blog routes are dynamic.

## Failure, replay, and security checks

- An unsigned POST to the portfolio receiver returned `401`.
- A body changed after signature generation also returned `401`.
- The publish fixture job was deliberately run with a mismatched in-memory
  secret. The receiver returned `401`; Payload recorded retryable job state,
  then reached `hasError: true` after the configured bounded three attempts.
- After restoring the matching in-memory secret, only that errored fixture job
  was reset and rerun. It delivered `204` and public content became visible.
  This is the same recovery mechanism as the replay utility, deliberately
  scoped here to avoid replaying unrelated local jobs.
- No draft body, user data, session material, database URL, R2 key, or secret
  was sent in the event assertions or recorded in output.

The test validates a recoverable signature/configuration failure. It does not
simulate an external network outage, deployed worker crash, or automatic
post-response `after()` scheduling from an authenticated CMS browser/API
request.

## Fixture and process cleanup

- Counts before and after the run were identical: Posts `0`, Categories `0`,
  fixture revalidation jobs `0`.
- The existing administrator was read only to authorize Local API fixture
  operations; it was not changed.
- No Media or R2 object was created.
- CMS and portfolio loopback processes were stopped. A completed Payload job is
  automatically removed by the queue; harness cleanup was adjusted to tolerate
  that expected state while still removing every retained fixture job.
- No migration runner was invoked. The existing local push-managed database
  remains separate from the reviewed migrations intended for a fresh production
  database.

## Commands and results

| Command / check | Result |
| --- | --- |
| Local end-to-end harness (real CMS REST, durable jobs, receiver, portfolio SSR) | PASS |
| CMS `bun install --frozen-lockfile` | PASS |
| CMS `bun run typecheck` | PASS |
| CMS `bun run lint` | PASS |
| CMS `bun run validate:revalidation` | PASS |
| CMS `bun run build` | PASS |
| CMS `bun run validate:editorial` against a temporary local CMS on port 3011 | PASS |
| CMS `bun run validate:r2-config` | PASS (static configuration check) |
| Portfolio `bun install --frozen-lockfile` | PASS |
| Portfolio `bun run validate:blog-contract` | PASS |
| Portfolio `bun run validate:blog-revalidation` | PASS |
| Portfolio `bun run typecheck` / `bun run build` | PASS |
| Portfolio `bun run lint` | PASS with the pre-existing `useProjects.tsx` exhaustive-deps warning (exit 0) |

## Remaining production prerequisites and risks

1. Set the same strong `BLOG_REVALIDATION_SECRET`, production CMS webhook URL,
   and server-only production CMS origin in the two independently deployed
   projects.
2. Run reviewed migrations only on a fresh/controlled Neon target; do not apply
   the baseline migration runner to the local push-managed database.
3. Operate a secure external job runner/monitoring path and retain a documented,
   scoped replay procedure. Delivery happens after the editorial DB commit, so
   bounded failure can leave stale content until replay or the five-minute
   fallback refreshes it.
4. Bind and verify the final production media hostname before relying on it in
   the public deployment.
5. Phase 6 additions such as sitemap/SEO data need corresponding cache tags and
   event invalidation coverage when they introduce new cached data.

## Git

The only tracked Phase 5C change is this report in the CMS repository. It was
committed locally as `4e011b5 test(cms): validate end-to-end blog publication
revalidation`. The portfolio repository was not modified or committed. No push
was performed.
