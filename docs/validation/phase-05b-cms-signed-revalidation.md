# Phase 5B: CMS signed blog revalidation sender

## Result

**Phase 5C readiness: READY for a non-production end-to-end publication test.**

The CMS now queues safe, signed portfolio cache-revalidation events for public
Post lifecycle changes. The implementation uses Payload's built-in jobs system
as a small durable outbox: the job is inserted in the same transaction as the
Post change, and the Next `after()` callback starts processing only after a CMS
web response completes. A rollback leaves no durable job for delivery.

This is at-least-once invalidation, not a distributed transaction. A production
deployment still needs an authenticated external job runner for deferred retries
on Vercel, and Phase 5C should validate a real CMS web edit through that
deployment path.

## Receiver contract inspected

Read-only portfolio sources reviewed:

- `../portfolio/src/app/api/internal/revalidate/route.ts`
- `../portfolio/src/services/blogRevalidation/contract.ts`
- `../portfolio/docs/validation/phase-05a-portfolio-revalidation.md`

The sender uses exactly this version-1 request contract:

- `POST /api/internal/revalidate`
- `Content-Type: application/json; charset=utf-8`
- `X-Blog-Revalidation-Timestamp`: ten-digit Unix seconds
- `X-Blog-Revalidation-Signature`: `sha256=<lowercase-hex>`
- signature bytes: UTF-8 `<timestamp>.<exact raw JSON bytes>` using HMAC-SHA256
- event body: receiver-compatible `version`, UUIDv4 `eventId`, allowed
  operation, and the `post` object with only ID/current/previous slug and
  category-slug fields

No content, users, media credentials, URLs with credentials, or secrets are
included in job input or webhook bodies.

## Lifecycle mapping and delivery

`src/revalidation/posts.ts` reads the persisted public Post state before and
after a change. This distinguishes a saved draft over a published document from
an actual public mutation.

| Public state transition | Queued operation | Location fields |
| --- | --- | --- |
| Draft -> draft | None | Draft-only work remains private. |
| Draft/nonexistent -> published | `publish` | Current `slug`, `categorySlug`. |
| Published -> published | `update` | Current location; prior slug/category only if changed. |
| Published -> draft | `unpublish` | Prior public slug/category. |
| Published -> deleted | `delete` | Prior public slug/category. |

The job task treats only HTTP 204 as delivery success. HTTP 408, 429, 5xx,
network errors, and timeouts use Payload's two exponential retries (one- and
two-second delays). Invalid configuration and other 4xx responses become a
bounded failed job rather than a silent publication success. Jobs contain safe
event metadata and Payload failure logs; after correction, an operator may run
`bun run revalidate:replay` to reset and process failed revalidation jobs.

`PORTFOLIO_REVALIDATION_URL` and `BLOG_REVALIDATION_SECRET` are server-only.
Both must be configured together; HTTPS is required outside loopback local
development. Local development remains opt-in when both are absent.

## Schema and migration

Enabling Payload's existing job system requires the reviewed additive migration
`20261029_202955_phase_05_blog_revalidation_jobs`. Its up migration creates
only `payload_jobs`, `payload_jobs_log`, their task/status enums, foreign key,
and indexes. It was generated and reviewed but **not applied** through the
migration runner to the existing push-managed `cms_portfolio_dev` database.

For a fresh production database, apply the prior reviewed baseline migrations
and then this migration in order. Its down migration drops the job tables and
enums, so it is destructive and is not an operational rollback command.

## Validation

| Check | Result | Evidence |
| --- | --- | --- |
| Frozen install | PASS | `bun install --frozen-lockfile` completed with no dependency changes. |
| Typecheck / lint / build | PASS | `bun run typecheck`, `bun run lint`, and `bun run build` completed successfully. |
| Sender contract validator | PASS | `bun run validate:revalidation` covered signing bytes, strict event shape, safe URL configuration, publish/update/unpublish/delete mapping, no draft-only event, 204, 401, and retryable 503 classification. |
| Existing editorial regression | PASS | `CMS_TEST_ORIGIN=http://127.0.0.1:3011 bun run validate:editorial` passed against local PostgreSQL. Its temporary content and media fixtures were removed. |
| Actual collection hook queue | PASS | A disposable Local API draft created no job; publishing it queued the expected `publish` job. The uniquely prefixed Post, Categories, and job were removed afterward. |
| Actual portfolio receiver contract | PASS | Ephemeral loopback portfolio receiver returned 204 for the CMS sender. Wrong secret, stale timestamp, and tampered body returned 401; signed malformed JSON returned 400. The secret existed only in memory and both servers stopped. |
| Full CMS web-request `after()` dispatch | NOT RUN | The Local API intentionally has no Next request scope. Phase 5C should publish via the CMS web/admin route and observe the post-response job runner. |
| Production scheduler / deployment | NOT RUN | Requires configured Vercel environments and an authenticated external runner; out of scope. |

During ad-hoc Local API fixture cleanup, Bun emitted unrelated package-resolution
noise after successful cleanup. It did not affect source validation; all
created Phase 5B fixture records were confirmed absent afterward.

## Files and operator setup

- `src/revalidation/**` — strict contract, server-only configuration, delivery,
  Payload task, transactional lifecycle hooks.
- `src/collections/Posts.ts`, `src/payload.config.ts` — hook and job-task
  registration.
- `src/migrations/20261029_202955_phase_05_blog_revalidation_jobs.*` — reviewed,
  unapplied job-table migration and index update.
- `scripts/validate-revalidation-sender.ts` — deterministic protocol/lifecycle
  validation.
- `scripts/replay-revalidation-jobs.ts` — explicit recovery for only failed
  revalidation jobs.
- `.env.example`, `README.md`, `package.json`, and generated Payload types —
  setup, operational handoff, and reproducible commands.

Before a deployed Phase 5C test, configure only the variable names documented
above in the CMS environment, use the same secret as the portfolio receiver,
apply reviewed migrations to a fresh target, and arrange an authenticated job
runner for retries. Do not commit local `.env` values or enable a public job
runner endpoint.

## Git

Task-scoped changes are committed in the Phase 5B handoff. No push is made.
