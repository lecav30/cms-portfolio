# Phase 8C — production infrastructure and deployment configuration

**Date:** 2026-10-30
**CMS baseline:** `main` at `4af6319 feat(cms): secure scheduled revalidation job runner`
**Related portfolio reference:** read-only `develop`; its receiver is
`POST /api/internal/revalidate` and is documented in
`../portfolio/docs/validation/phase-05a-portfolio-revalidation.md`.

## Decision

**NO-GO for production deployment.** The code and local validation are ready
for operator-led provisioning, but no production Neon project/database, R2
bucket/custom domain, CMS Vercel project/domain, Production environment values,
or production smoke test has been verified. This phase made no remote API,
dashboard, DNS, migration, deployment, or Git push operation.

The next checkpoint is a single operator provisioning pass described below. Do
not paste any credential, connection string, account ID, or DNS target into the
terminal transcript or this repository; enter values directly in the provider
dashboards, then confirm only that each checklist item is complete.

## Current architecture and isolation

| Component | Production target | Current evidence | Status |
| --- | --- | --- | --- |
| CMS application | Separate Vercel project from this repository, root directory `.` | `package.json`, `bun.lockb`, `vercel.json`, and Node 24-compatible dependencies inspected | NEEDS OPERATOR ACTION |
| CMS hostname | `cms.sebastianlevano.com` | No Vercel-domain or DNS state was queried | BLOCKED |
| Public portfolio | Existing separate Vercel project at `https://www.sebastianlevano.com` | Read-only receiver contract inspected | Existing project; production linkage unverified |
| PostgreSQL | Dedicated Neon production project/database or isolated production branch | Local `cms_portfolio_dev` is explicitly push-managed only | BLOCKED |
| Media | Dedicated production R2 bucket, `media/` key prefix, `https://media.sebastianlevano.com` | Development R2 lifecycle previously passed; no production bucket/domain checked | BLOCKED |
| Revalidation jobs | CMS cron route → durable Payload job → portfolio receiver | Local route/job/recovery test passed in Phase 8B | Production configuration unverified |

Development and production must never share a database, R2 bucket, access key,
Payload secret, cron secret, or administrator credentials. Vercel Preview is
also a production-mode build for this app: because the R2 configuration fails
closed outside local development, a running CMS Preview needs separate
non-production Postgres/R2 resources. Until those exist, keep Preview CMS
deployments as build-only validation and do not publish/edit through them.

## Vercel projects, runtime, and domains

### CMS project

1. In Vercel, import `lecav30/cms-portfolio` as a **new, separate** project.
   Leave Root Directory as `.`; do not point it at the portfolio repository or
   create a monorepo configuration.
2. Set Framework Preset to Next.js, install with Bun detected from the tracked
   `bun.lockb`, and set Build Command to `bun run build`. Do **not** use
   `bun run build:with-migrations`.
3. In **Settings → Build and Deployment**, explicitly select Node.js `24.x`.
   `package.json` further constrains execution to `>=24.22.1 <25`; verify the
   deployed build log reports a compatible 24.x patch. Vercel currently offers
   Node 24.x and honors a compatible `engines.node` range.
4. In **Settings → Domains**, add `cms.sebastianlevano.com` to the CMS
   project’s Production environment. Follow the Vercel-provided DNS instruction
   in the Cloudflare zone; do not create a competing A/AAAA/CNAME record and do
   not guess the target. Wait for Vercel verification and HTTPS before setting
   `NEXT_PUBLIC_SERVER_URL` to that origin.
5. Keep `www.sebastianlevano.com` attached only to the existing portfolio
   project. A CMS deployment must not claim or redirect that domain.

### Environment scopes

Create variables in Vercel project settings, never in `vercel.json`. Variables
take effect only in new deployments. Use Production values only in Production;
use independently provisioned non-production values in Preview if CMS Preview
runtime access is intentionally enabled; retain local values in ignored `.env`.

| Variable | CMS scope and purpose | Portfolio relationship |
| --- | --- | --- |
| `DATABASE_URL` | Production-only TLS Neon **direct, non-`-pooler`** connection URL. Required at build/runtime. | CMS only |
| `PAYLOAD_SECRET` | Unique high-entropy CMS auth/session secret. | CMS only |
| `NEXT_PUBLIC_SERVER_URL` | Exact public CMS origin, `https://cms.sebastianlevano.com`, after DNS/TLS verifies. | CMS only; public value, still scope it correctly |
| `CORS_ORIGINS` | Exact deliberate browser origins, normally `https://www.sebastianlevano.com`; no wildcard. | Portfolio origin is the expected value; server-side REST reads do not need CORS |
| `R2_ENABLED` | `true` in a running production CMS. | CMS only |
| `R2_BUCKET` | Dedicated production bucket name. | CMS only |
| `R2_ENDPOINT` | Account S3 API endpoint; never a browser asset URL. | CMS only |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Scoped S3 credentials for the one production bucket. | CMS only; server-only |
| `R2_PUBLIC_BASE_URL` | `https://media.sebastianlevano.com` only after the custom domain is active. | Public media base consumed by portfolio responses, but configured in CMS |
| `PORTFOLIO_REVALIDATION_URL` | Exact Production receiver: `https://www.sebastianlevano.com/api/internal/revalidate`. | CMS sender only |
| `BLOG_REVALIDATION_SECRET` | Strong shared HMAC secret. | Must exactly match the portfolio project’s server-only `BLOG_REVALIDATION_SECRET` in the same environment |
| `CRON_SECRET` | Different strong secret, minimum 32 bytes, for CMS Vercel Cron only. | CMS only; never reuse the HMAC or Payload secret |
| `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` | One controlled first deployment only, after confirming the fresh target has zero users. Remove both and redeploy immediately. | CMS only; never Preview/shared default |
| `PAYLOAD_CMS_URL` | Not set in CMS. | Portfolio-only server-side variable; set to CMS HTTPS origin only after CMS smoke tests pass |

No unlisted production environment variable was found in the CMS source. The
portfolio reference confirms `PAYLOAD_CMS_URL` and `BLOG_REVALIDATION_SECRET`;
the latter is the only cross-project secret.

## Neon provisioning and migration runbook

### Provisioning gate

1. Create a dedicated Neon production project/database (or an isolated,
   explicitly designated production branch) in a region selected to minimize
   latency to the chosen CMS Vercel function region. Confirm the actual Neon and
   Vercel region pair in their dashboards; no region was assumed in this audit.
2. Create a least-privilege application role and a controlled migration role as
   required by the operator’s Neon policy. Store only the application’s direct
   TLS connection in CMS Production `DATABASE_URL`; retain migration credentials
   only in the access-controlled release session.
3. **Use the direct Neon endpoint, not the `-pooler` endpoint**, until a
   production-like test proves compatibility. Phase 8B holds a session-level
   PostgreSQL advisory lock for the full runner invocation. Neon’s pooled
   endpoint uses PgBouncer transaction pooling, which does not provide a safe
   basis for assuming a session lock persists across statements. Direct access
   also remains the reviewed migration path. Monitor connection pressure after
   deployment; a future change to pooled application connections requires a
   redesigned/tested distributed locking strategy.
4. Record Neon retention, branch/PITR restoration procedure, compute autosuspend
   policy, costs, and the owner of the production project. Before any migration,
   create a dated Neon branch/restore point and verify the operator can connect
   to it. This is the rollback source; it is not an excuse to execute migration
   `down` scripts automatically.

### Reviewed migration inventory

The migration list is ordered in `src/migrations/index.ts`:

1. `20261029_025459_phase_02_editorial_collections` — baseline Payload auth,
   editorial, media, versions, relation, preference/lock, key-value, and
   migration tables; includes unique slug/email indexes and draft/published
   enums.
2. `20261029_032843_phase_03_r2_media_prefix` — adds `media.prefix` with
   default `media`.
3. `20261029_202955_phase_05_blog_revalidation_jobs` — adds `payload_jobs`,
   `payload_jobs_log`, related enums, and queue/retry indexes.

All three were reviewed and previously tested in order on a fresh disposable
local database. `bun run migrate:status` during this phase showed all three as
**not run** on `cms_portfolio_dev`; this is expected because that existing local
database is push-managed and must not be migrated.

### One-time production procedure — approval required before step 6

1. Confirm the target hostname/database name and direct TLS connection in a
   private operator session. Abort if it is not the new, isolated production
   target or if `payload_migrations`/application tables already contain unknown
   state.
2. Confirm the code revision is exactly the reviewed migration revision and run
   `bun install --frozen-lockfile`, `bun run typecheck`, and `bun run build`.
3. Capture a Neon branch/restore point and record its timestamp privately. If
   the database is not fresh, stop; this runbook does not authorize repair or
   destructive reconciliation.
4. Run `bun run migrate:status` with the controlled migration environment.
   Expect all three migrations to be pending on a fresh target. This command is
   a preflight, not a dry-run of SQL.
5. Inspect the committed `up` SQL once more, including the baseline’s numerous
   `CREATE` statements and the jobs enum/table creation. Never run
   `migrate:down`, `migrate:fresh`, `migrate:reset`, `migrate:refresh`, or
   Payload schema push against production.
6. **Operator approval gate:** run `bun run migrate` once from a single
   access-controlled release terminal/CI job using the confirmed direct target.
   Do not run it as Vercel Build Command and do not run concurrent deployments.
7. Run `bun run migrate:status`; expect the same three names recorded in
   `payload_migrations` in order. Run a read-only table/health check. Abort
   rollout on unexpected schema state, connection failure, or migration error.
8. If application release fails after a successful migration, roll back only to
   a compatible CMS deployment. For a schema/data incident, isolate traffic,
   create a diagnostic branch, and restore/branch from the preflight Neon point
   according to the operator’s verified recovery procedure. Do not auto-run a
   destructive down migration.

## Cloudflare R2 and media domain

1. Create a **new production** R2 bucket; do not reuse the development bucket
   or credentials. The CMS adapter stores objects under `media/` and uses the
   S3 API only server-side.
2. Create an R2 S3-compatible API token with **Object Read & Write** restricted
   to this one bucket. Read/write/list is needed for authenticated upload,
   replacement, and deletion. Do not choose account-wide admin permission; save
   the Access Key ID and Secret Access Key directly in Vercel Production
   variables because Cloudflare will not show the secret again.
3. In the R2 bucket’s **Settings → Custom Domains**, attach
   `media.sebastianlevano.com`. The `sebastianlevano.com` zone must be in the
   same Cloudflare account as the bucket. Let Cloudflare create/manage the
   required record; do not invent a CNAME to an `r2.dev` address.
4. Wait for the domain’s R2 status, ownership, and TLS to become active. Keep
   the S3 endpoint private and set `R2_PUBLIC_BASE_URL` only to this HTTPS
   custom domain. Keep `r2.dev` disabled for the production bucket where the
   custom domain is the desired public path.
5. Decide and document cache policy before editorial launch. R2 custom domains
   can use Cloudflare Cache; replacement/deletion can otherwise remain stale at
   edges. Verify an allowed image upload, returned CMS URL, anonymous HTTPS
   fetch/content type, cover-image relation, replacement, deletion, and no
   orphaned test object before accepting production media.

## CMS deployment, cron, and smoke tests

After the approved migration succeeds:

1. Add CMS Production variables, including `R2_ENABLED=true`; set exact URLs
   only after their domains verify. Deploy the already-migrated CMS revision.
2. On the first controlled deployment only, provide `INITIAL_ADMIN_*` privately
   and verify the fresh database has no Users. Sign in at `/admin`, then remove
   both variables and redeploy. There is no public signup path.
3. Verify over HTTPS: `/admin` responds and authenticates; anonymous
   `GET /api/users` and anonymous editorial mutations are denied; anonymous
   Posts reads expose only published posts; `/admin` and `/api` retain
   noindex headers; CORS rejects unlisted origins.
4. Verify R2 lifecycle with a disposable allowed image and clean it up.
5. Verify the cron route rejects absent/invalid bearer authentication, then use
   Vercel’s Cron dashboard/logs to observe a scheduled `GET` after it runs.
   Do not manually disclose or place `CRON_SECRET` in a shell history. The
   schedule `17 3 * * *` is UTC. It is daily; on Hobby it may execute at any
   time during the 03:00–03:59 UTC hour.
6. Monitor Vercel function logs for the cron path and Payload job failures.
   Vercel does not retry a failed cron invocation and its delivery can be
   duplicated or missed; the PostgreSQL advisory lock, durable queue, bounded
   retries, and operator replay are the recovery layers. Alert on cron `401`/
   `500`, repeated `202`, delivery failures, and queue backlog. Review failed
   jobs before deliberately invoking `bun run revalidate:replay` from a trusted
   environment.

## Cross-project release order

1. Provision Neon, R2, Cloudflare media domain, and the CMS Vercel project.
2. Set CMS Production variables and complete the approved one-time migration.
3. Deploy and smoke-test CMS, R2, admin/API restrictions, and cron.
4. In the existing portfolio project, add Production `PAYLOAD_CMS_URL` and the
   matching `BLOG_REVALIDATION_SECRET`; deploy portfolio only after the CMS
   HTTPS API is healthy. Do not modify the portfolio in this task.
5. From the CMS, use a disposable post to validate publish/update/move/
   unpublish/delete causes signed production revalidation; then remove the
   fixture. Verify sitemap/RSS/SEO behavior in the portfolio separately.

If CMS is rolled back before the portfolio update, retain compatible CMS API
contracts. If the portfolio receiver is unhealthy, publication changes remain
durable jobs; fix the receiver/configuration and replay only diagnosed failed
revalidation jobs. If R2 is unhealthy, stop media uploads rather than falling
back to Vercel filesystem storage. If Neon is unavailable or migration state is
uncertain, halt CMS writes and use the verified Neon recovery point/branch
workflow.

## Validation in this phase

| Check | Result | Evidence |
| --- | --- | --- |
| Working tree / baseline | PASS | Started clean on `main`, `4af6319`; remote is CMS repository. |
| Node / Bun | PASS | Node `v24.22.1`, Bun `1.1.18`. |
| `vercel`, `neonctl`, `wrangler` CLI availability | NOT RUN / not found | No provider CLI was available through `PATH`; no account login attempted. |
| Migration source ordering | PASS | Three files and `src/migrations/index.ts` inspected. |
| Local `bun run migrate:status` | PASS | All three migrations reported not run, expected for the push-managed local DB. |
| Vercel cron/static config | PASS (source review) | `vercel.json` is GET path `/api/internal/revalidation-jobs/run`, `17 3 * * *`; Phase 8B validated route auth/bounds locally. |
| Neon/R2/Vercel/DNS live validation | NOT RUN | No production resources or authorization to contact them. |
| Production migration/deploy | NOT RUN | Explicitly outside this task’s authorization. |

## Files changed

- `.env.example` clarifies the direct Neon endpoint requirement created by the
  session advisory lock.
- `README.md` removes the obsolete “no configured production job runner” claim
  and documents the Vercel Preview isolation requirement.
- This report records the complete operator gate and release procedure.

## Operator checkpoint

Complete the following privately, then reply only with confirmation (never
values):

1. CMS Vercel project created with Node 24.x and Production environment values
   entered.
2. Fresh dedicated Neon production target created; direct TLS application and
   controlled migration access confirmed; recovery point procedure available.
3. Separate production R2 bucket/token and active
   `media.sebastianlevano.com` custom domain created.
4. `cms.sebastianlevano.com` verified in the CMS Vercel project.
5. Portfolio Production `BLOG_REVALIDATION_SECRET` and CMS
   `BLOG_REVALIDATION_SECRET` set to the same new value; CMS target receiver URL
   and `CRON_SECRET` set.

Only then may a separate, explicitly authorized deployment/migration prompt run
the gated production procedure. No push occurred in this phase.
