# Phase 8B — secure scheduled revalidation job runner

## Decision

The code-level Vercel Cron blocker identified in Phase 8A is addressed and
locally validated. This is **not** a production-deployment approval: Neon,
production R2 and DNS/custom domains, Vercel environment configuration, a
controlled migration release, and production monitoring still require operator
action.

## Implemented topology

- Route: `GET /api/internal/revalidation-jobs/run`
- Schedule: `17 3 * * *` in `vercel.json` (once daily, 03:17 UTC nominal).
  This is deliberately a recovery backstop for deferred failures; normal CMS
  requests still start delivery after the committed response.
- Runtime: Node.js; dynamic route; `maxDuration = 15` seconds; responses set
  `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow, noarchive`.
- Scope: a maximum of ten sequential jobs per request, filtered to both the
  dedicated `blog-revalidation` queue and `blog-revalidation` task slug.
  It never enables `allQueues` and it does not handle schedules.
- Concurrency: a PostgreSQL session advisory lock is held around the bounded
  runner. The request hook, `bun run revalidate:jobs`, and
  `bun run revalidate:replay` now share this runner. A concurrent request gets
  `202 {"status":"already-running"}` and does not execute a job.

The route is intentionally separate from Payload's generic jobs endpoint. The
generic endpoint remains subject to Payload authentication but is not the cron
integration and is not used by this configuration.

## Authentication and HTTP contract

`CRON_SECRET` is a dedicated server-only secret. It is not interchangeable with
`PAYLOAD_SECRET` or `BLOG_REVALIDATION_SECRET`. The implementation accepts only
an exact `Authorization: Bearer <CRON_SECRET>` header and compares equal-length
byte buffers with `timingSafeEqual`. It fails closed unless the secret is
trimmed and at least 32 UTF-8 bytes.

| Condition | Observed/configured response | Job execution |
| --- | --- | --- |
| Missing, malformed, or wrong bearer header | `401` | None |
| Missing, malformed, or weak `CRON_SECRET` | `503` | None |
| Any method other than `GET` | `405`, `Allow: GET` | None |
| Valid token and lock acquired | `200` with aggregate-safe counters | Dedicated bounded batch only |
| Valid token but another shared runner owns the lock | `202` | None |
| Runner/setup failure | `500` generic body | No sensitive error body |

No job input, webhook signature, endpoint URL, credentials, or stack trace is
returned by the route. Existing global `/api` noindex headers remain in place.

## Queue and recovery behavior

The existing `blogRevalidationTask` still owns signed delivery, its five-second
HTTP deadline, and Payload retry/backoff configuration. The cron handler does
not alter job state itself; it delegates to `payload.jobs.run` with the existing
task filter. Failed jobs remain durable. After an operator fixes a receiver or
configuration issue, `bun run revalidate:replay` is the deliberate recovery
command: it resets only failed `blog-revalidation` jobs and invokes the same
locked bounded runner. Do not use it as a routine cron replacement or against
an unexplained backlog.

The advisory lock is a database-wide safeguard for all project-owned runner
paths. It cannot prevent a separately invoked generic Payload jobs endpoint
from overlapping, so production operators must use this route/CLI path for
scheduled execution. The portfolio receiver remains idempotent/revalidation
oriented and retains its five-minute fallback; the system is at-least-once, not
exactly-once delivery.

## Validation

Environment used: CMS `main`, Node `v24.22.1`, Bun `1.1.18`, Payload `3.89.0`,
Next `16.3.4`, and the existing local PostgreSQL development database. No
production provider resource was contacted. The live script generated secrets
in process memory, used a loopback receiver, created only `payload-jobs`
fixtures, and removed those fixtures before exit.

| Check | Result | Evidence |
| --- | --- | --- |
| `bun install --frozen-lockfile` | PASS | Lockfile was coherent; no changes. |
| `bun run typecheck` | PASS | Includes route, runner, and validation scripts. |
| `bun run lint` | PASS | No new warnings. |
| `bun run build` | PASS | Route appears as dynamic `/api/internal/revalidation-jobs/run`. |
| `bun run validate:cron-runner` | PASS | Missing/weak/whitespace secret, exact/malformed/wrong bearer, task+queue filter, lock release, and busy lock tested with controlled doubles. |
| `bun run validate:cron-runner-live` | PASS | Local HTTP checks observed `401` for absent/malformed/wrong auth, `405` for POST, a real PostgreSQL-held runner lock producing `202` with zero execution, a subsequent `200` valid signed loopback delivery, no execution of an unrelated-queue fixture, transient `503` receiver failure with durable incomplete fixture, and controlled fixture recovery. |
| Existing signed sender contract (`bun run validate:revalidation`) | PASS | Re-run after the shared runner change. |
| R2 configuration selection (`bun run validate:r2-config`) | PASS | Static storage policy regression check. |
| `git diff --check` | PASS | Run before commit. |

The live test used `next start` after the production build rather than claiming
that a development server emulates Vercel Cron. It stopped the spawned CMS and
loopback receiver in `finally`; it created no Posts, Users, Media, R2 objects,
or persistent test credentials.

## Files changed

- `src/app/api/internal/revalidation-jobs/run/route.ts` — authenticated,
  GET-only, no-store cron route.
- `src/revalidation/cron.ts` and `src/revalidation/runner.ts` — secret policy,
  bounded queue/task filtering, and shared PostgreSQL advisory-lock runner.
- `src/revalidation/posts.ts`, `scripts/run-revalidation-jobs.ts`, and
  `scripts/replay-revalidation-jobs.ts` — existing invocation paths use the
  shared runner.
- `scripts/validate-cron-job-runner.ts` and
  `scripts/validate-cron-job-runner-live.ts` — deterministic unit and local
  integration checks.
- `package.json`, `.env.example`, `README.md`, and `vercel.json` — commands,
  server-only secret documentation, runbook details, and the cron definition.

No database migration was added or applied.

## Production operator checklist

1. Provision the separate Vercel CMS project with Node `24.x`, then configure
   `DATABASE_URL`, `PAYLOAD_SECRET`, `NEXT_PUBLIC_SERVER_URL`, `CORS_ORIGINS`,
   `PORTFOLIO_REVALIDATION_URL`, `BLOG_REVALIDATION_SECRET`, `CRON_SECRET`, and
   all `R2_*` variables in the appropriate encrypted environment scopes. Do
   not configure `INITIAL_ADMIN_*` after controlled bootstrap.
2. Use a unique `CRON_SECRET` of at least 32 random bytes. Confirm Vercel Cron
   is enabled after deployment and that it sends the bearer header. Keep it
   separate from the portfolio signing secret.
3. Apply the three reviewed migrations once, in order, to a fresh controlled
   Neon production database from a single access-controlled release step; do
   not run development schema push or `build:with-migrations` in Vercel.
4. Provision the production R2 bucket, least-privilege credentials, and active
   `media.sebastianlevano.com`; configure `cms.sebastianlevano.com` and the
   portfolio revalidation URL/secret only after TLS/DNS are ready.
5. Verify the cron invocation in Vercel Logs and alert on `401`, `500`, a
   sustained `202`, or failed Payload jobs. Vercel does not retry failed cron
   invocations, and scheduled delivery is best effort; inspect the durable jobs
   queue and use the documented replay command only after diagnosis.
6. Confirm the Vercel plan permits the selected daily schedule. Hobby permits
   only daily cron and can run it at any point in the selected hour; higher
   plans have different cadence guarantees. The 15-second function cap and
   ten-job batch are intentionally conservative; tune only after measured
   production delivery time and plan limits are known.

## Remaining blockers and risks

- **NO-GO for production deployment remains** until Neon, production R2,
  `cms`/media domains, Vercel encrypted variables, a production migration run,
  initial-admin procedure, and production observability are completed.
- Vercel Cron can miss or duplicate invocations and does not retry failed
  invocations. The durable Payload queue, advisory lock, receiver idempotency,
  five-minute portfolio fallback, and operator replay are the recovery layers;
  they are not an external queue service guarantee.
- The local test validates the real route, local Postgres, and a loopback
  signed receiver. It does not validate Vercel's production scheduler, actual
  function limits, Neon connectivity, or deployed portfolio availability.

No push, deployment, migration, or provider configuration was performed.
