# Phase 8A: CMS production readiness and deployment prerequisites

## Decision

**NO-GO for production deployment today.** The CMS source, lockfile, build,
R2 production fail-closed behavior, and a complete fresh-database migration
chain are validated. Deployment remains blocked by unprovisioned production
infrastructure and, most importantly, by the absence of an authenticated
serverless job runner for failed revalidation jobs.

This is a predeployment audit only. No Vercel project, Neon database, R2
production bucket, DNS record, production secret, deployment, or remote Git
state was changed.

## Inspected state

- Repository: `lecav30/cms-portfolio`, branch `main`, initially clean at
  `448622d`.
- Related repository inspected read-only: `../portfolio`, branch `develop`,
  current head `95c6a68`.
- Runtime used for local checks: Node `v24.22.1` via nvm and Bun `1.1.18`.
- Application versions: Payload and official Payload packages `3.89.0`, Next
  `16.3.4`, React `19.2.8`, TypeScript `5.7.3`.
- Lockfile: tracked binary `bun.lockb`; frozen install completed without
  changes.
- Key files reviewed: `src/payload.config.ts`, `src/storage/r2.ts`,
  `src/revalidation/{config,contract,delivery,posts,task}.ts`,
  `src/collections/{Users,Posts,Media}.ts`, `next.config.mjs`,
  `src/app/robots.ts`, `src/migrations/index.ts`, and all three migration
  sources.

The ignored local `.env` remains ignored. Only required variable *presence* was
checked. Local development has database, Payload, CMS URL/CORS, and R2 values;
local portfolio-revalidation and bootstrap values are absent, which is an
expected non-production configuration. No values are recorded here.

## Readiness matrix

| Area | Status | Evidence / required action |
| --- | --- | --- |
| Pinned application compatibility | PASS | `package.json` aligns all Payload packages at `3.89.0`, pins the Node range `>=24.22.1 <25`, and commits `bun.lockb`. |
| Vercel Node runtime | NEEDS OPERATOR ACTION | Explicitly select Node `24.x` in the separate CMS project. Vercel's default major can change; Node 24 is available but minor/patch updates are platform-managed. Verify build/runtime logs satisfy the package engine range. |
| Bun install reproducibility | PASS / NEEDS OPERATOR ACTION | Local frozen install passed. Vercel detects `bun.lockb`, but the operator must inspect the first build log and confirm the selected Bun 1.x behavior remains compatible with the committed Bun 1.1 lockfile. |
| Build / static quality | PASS | Frozen install, typecheck, lint, and production build passed with the local private environment. |
| PostgreSQL adapter / TLS | NEEDS OPERATOR ACTION | `@payloadcms/db-postgres` reads `DATABASE_URL`; the code never disables certificate verification. Use a dedicated Neon production database and a Neon TLS connection string, with a direct migration-capable endpoint for the single migration step. |
| Fresh migration chain | PASS | A named disposable local database was created only for this audit, received all three migrations in order, reported all as applied, then was dropped. |
| Existing local development database | PASS / DO NOT MIGRATE | `cms_portfolio_dev` migration status reports all three as not run, as expected for the push-managed local schema. Never run the baseline migrations against it. |
| Production R2 policy | PASS in code / BLOCKED live | `src/storage/r2.ts` refuses `R2_ENABLED=false` in a production runtime and requires all server-side R2 fields when enabled. Production bucket, scoped credentials, custom hostname, and HTTPS delivery have not been provisioned or tested. |
| Local filesystem media | PASS | It is available only when R2 is disabled outside production and `media/` is ignored. A production start fails before it can select ephemeral filesystem storage. |
| Admin / REST protection | PASS by source review and prior live validation | Users and editorial mutations require authentication; Posts public reads are constrained to published documents; GraphQL is disabled. `/admin` and `/api` have no-index headers and robots disallow rules. Robots is not relied on for access control. |
| CORS / CSRF origin safety | PASS | `CORS_ORIGINS` is now parsed as exact HTTP(S) origins only; wildcard, credentials, paths, query strings, fragments, and non-loopback HTTP are rejected. Production must supply only intentional origins. |
| First-admin bootstrap | NEEDS OPERATOR ACTION | Bootstrap variables are read only when the Users collection is empty. Supply them only for the controlled first production start, create exactly one administrator, then remove both variables and deploy again. |
| Signed portfolio revalidation | BLOCKED for production | Sender/receiver contract and local end-to-end flow passed in Phase 5C, but local `PORTFOLIO_REVALIDATION_URL` / `BLOG_REVALIDATION_SECRET` are intentionally absent and no production projects/secrets exist. |
| Durable Payload jobs | BLOCKED — Phase 8B | Durable rows and bounded task retries exist, but no configured authenticated external runner will collect deferred/failed jobs on Vercel. See the dedicated runner assessment below. |
| Backups / restore | NEEDS OPERATOR ACTION | Configure and test Neon point-in-time/branch/backup policy, R2 object lifecycle/versioning policy, Vercel log retention, and a documented restore drill before launch. |

## Migration inventory and verified procedure

`src/migrations/index.ts` orders the complete current fresh-database chain:

1. `20261029_025459_phase_02_editorial_collections` creates Users, Categories,
   Tags, Media, Posts, post versions/relationships, Payload preferences/locks/
   migration tables, and their indexes/enums.
2. `20261029_032843_phase_03_r2_media_prefix` adds `media.prefix`.
3. `20261029_202955_phase_05_blog_revalidation_jobs` adds `payload_jobs`,
   `payload_jobs_log`, task/status enums, foreign key, and indexes.

Phase 7A technical code/math/table support stores its nodes in the existing
Lexical JSON content field. It requires no SQL migration.

The audit used the explicitly absent local database name
`cms_portfolio_phase08_migration_check`. It was created from the confirmed
local `cms_portfolio_dev` connection context, migrations ran with production
mode configuration, `migrate:status` showed all three migrations in batch 1,
and the disposable database was dropped afterward. This did not apply, reset,
or modify any existing database.

For the first production release:

1. Operator provisions a **new, empty** Neon production database in a region
   compatible with the CMS Vercel region and obtains a migration-capable TLS
   connection URL.
2. In one access-controlled release/CI step, load the exact production
   environment, run `bun run migrate:status`, review that the three entries are
   pending, take/confirm the provider recovery point, and run `bun run migrate`
   exactly once.
3. Confirm all three entries are recorded and the expected tables/indexes
   exist. Do not run `migrate:down`, `migrate:refresh`, or schema push.
4. Deploy the same already-migrated CMS revision with normal `bun run build`.
   Preview deployments must not share that database or own migrations.

The migration `down` functions drop tables, columns, and enums; they are not a
production rollback plan. Roll back application code independently and restore
from provider backup only under an approved recovery procedure.

## Durable revalidation job runner: current state and blocker

`Posts` hooks queue `blog-revalidation` jobs transactionally. `after()` makes a
best-effort post-response attempt to run up to ten jobs. The job task signs and
delivers to the portfolio, retries transient failures twice, and leaves
exhausted failures in the database. `bun run revalidate:jobs` and `bun run
revalidate:replay` are manual/local recovery tools; replay resets only failed
jobs in that queue before running them.

The current configuration has **no** `jobs.access.run` override, no
`vercel.json` Cron schedule, no `CRON_SECRET`, and no dedicated worker. Payload
does register `GET /api/payload-jobs/run`, but its default endpoint access is a
logged-in Payload user. A Vercel Cron request will not carry that CMS session,
so it cannot currently be the runner. An in-process `autoRun` worker must not
be added for Vercel's serverless runtime.

**Minimum Phase 8B implementation:** add a server-only `CRON_SECRET`, a
timing-safe `jobs.access.run` policy (or an equivalently protected narrow route)
that accepts only `Authorization: Bearer <CRON_SECRET>` in addition to intended
CMS-admin access, and a bounded Vercel Cron definition that invokes only the
`blog-revalidation` queue. Add concurrency/idempotency safeguards, return
non-cacheable bounded results, test valid/invalid authorization and overlapping
invocations, and monitor job failure/age counts. Do not expose an unprotected
Payload jobs endpoint.

Vercel Cron itself is best effort and does not retry failed invocations. The
runner therefore must safely scan persisted outstanding jobs on each invocation;
operators need alerts for non-2xx cron responses, `payload_jobs.has_error`, and
old uncompleted jobs, plus the scoped replay runbook. Confirm the Vercel plan:
Hobby schedules are limited to daily invocation, which is insufficient as the
only recovery mechanism for a five-minute content-cache fallback.

## Required production configuration

Create separate production environments; do not copy local files or reuse
development bucket/database values.

### CMS Vercel project

- Repository root: this CMS repository, not `portfolio/`.
- Runtime: Node `24.x`; normal build command: `bun run build`.
- Keep `bun.lockb` as the only lockfile and verify the installation/build logs.
- `DATABASE_URL`, `PAYLOAD_SECRET`, `NEXT_PUBLIC_SERVER_URL`, `CORS_ORIGINS`.
- `R2_ENABLED`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL`.
- `PORTFOLIO_REVALIDATION_URL`, `BLOG_REVALIDATION_SECRET`.
- Later, after Phase 8B: `CRON_SECRET`.
- One-time only: `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`; remove after
  the first verified administrator exists.

Set `NEXT_PUBLIC_SERVER_URL` to `https://cms.sebastianlevano.com`,
`R2_PUBLIC_BASE_URL` to `https://media.sebastianlevano.com` only after it is
active, `CORS_ORIGINS` to exact deliberate browser origins (normally
`https://www.sebastianlevano.com` if needed), and the portfolio revalidation
URL to its exact public internal receiver path. The revalidation secret must
match the portfolio's server-only `BLOG_REVALIDATION_SECRET` exactly and must
not use a `NEXT_PUBLIC_` name.

### Neon, Cloudflare, and DNS

1. Create an isolated Neon production project/database and confirm region,
   connection limits, TLS, backup/restore, and migration connectivity.
2. Create a separate R2 production bucket and bucket-scoped credentials with
   only required object operations. Keep the S3 API endpoint private.
3. Bind `media.sebastianlevano.com` to the production R2 bucket, wait for DNS
   and TLS, and verify HTTPS GET/HEAD of a disposable object and deletion
   cleanup. Do not use `r2.dev` as the final hostname.
4. Attach `cms.sebastianlevano.com` to the separate CMS Vercel project and
   validate TLS, `/admin`, protected mutations, published-only REST, admin
   no-index headers, and the configured public media hostname.
5. Only after CMS, migrations, R2, and Phase 8B runner work, configure the
   portfolio production project with its server-only CMS origin and the same
   revalidation secret, then run an end-to-end publish/update/unpublish/delete
   smoke test.

## Checks executed

| Command / check | Result | Notes |
| --- | --- | --- |
| `bun install --frozen-lockfile` | PASS | 713 installs checked; lockfile unchanged. |
| `bun run typecheck` | PASS | TypeScript completed with no diagnostics. |
| `bun run lint` | PASS | ESLint completed with no diagnostics. |
| `bun run build` | PASS | Next 16.3.4 production build completed with ignored local configuration. |
| Wildcard `CORS_ORIGINS` rejection | PASS | A temporary process-scoped `CORS_ORIGINS=*` failed configuration generation before any output was written. |
| `bun run validate:r2-config` | PASS | Confirms local-dev opt-in and production R2 fail-closed configuration behavior. |
| `bun run validate:revalidation` | PASS | Sender contract, signature bytes, event shape, URL rules, retry classification, and no draft-only event. |
| `bun run migrate:status` on local dev DB | PASS | All three migrations correctly show not run on the push-managed `cms_portfolio_dev` database. |
| Fresh disposable migration apply/status | PASS | All three migrations applied/recorded, then audit DB removed. |
| Live production Neon/R2/Vercel/DNS | BLOCKED | Resources and credentials are deliberately not provisioned or used in this audit. |
| Production runner / Cron invocation | BLOCKED | No authenticated runner or schedule exists yet. |
| Production admin bootstrap / login | NOT RUN | Requires the new production database and one-time operator-controlled credentials. |

## Files changed and handoff

- `src/payload.config.ts`: rejects wildcard and malformed CORS/CSRF origin
  configuration; only exact HTTPS origins (or loopback HTTP for development)
  are accepted.
- `README.md`: corrects the Vercel migration sequence and makes the job-runner
  prerequisite explicit.
- This report: records verified facts, production blockers, and operator order.

No CMS schema, generated type, R2 object, local administrator, editorial row,
or portfolio file changed. See the final task handoff for the local commit that
contains this report; no push or deployment was performed.
