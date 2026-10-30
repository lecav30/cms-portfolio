# Phase 8D — production environment preflight (no deploy)

**Date:** 2026-10-30

## Scope and decision

This was a read-only preflight. No Vercel setting, environment variable, DNS
record, Neon database, R2 object, migration, deployment, administrator, or
remote Git state was changed.

**Decision: NO-GO for the separately authorized production migration/deployment
step.** Two public-facing blockers were observed, and Vercel project/environment
configuration could not be independently inspected from this machine:

1. `cms.sebastianlevano.com` did not resolve during the HTTPS preflight, so no
   CMS deployment, domain binding, or TLS smoke test is possible yet.
2. `https://www.sebastianlevano.com/api/internal/revalidate` returned `404`.
   The checked local portfolio `develop` source contains the Phase 5A route, so
   the public portfolio deployment does not currently expose the required
   receiver. A CMS publication job would therefore fail delivery.

The operator-reported Neon/R2/Vercel provisioning remains **present but
unverified**; it is not treated as proof of a releasable production state.

## Repository and tool state

| Item | Result |
| --- | --- |
| CMS repository | `/Users/lecav/Documents/own/sebastianlevano/cms` (`lecav30/cms-portfolio`) |
| Branch / baseline | `main` at `54ccf49 docs(cms): prepare production infrastructure and deployment runbook` |
| Remote relationship | `main...origin/main` at preflight start; the Phase 8C commit is therefore present at the configured remote ref locally |
| Node / Bun | Node `v24.22.1`, Bun `1.1.18` |
| CMS package contract | Payload packages `3.89.0`, Next `16.3.4`, engines `>=24.22.1 <25` |
| Provider CLI | `vercel`, `neonctl`, and `wrangler` were not available through `PATH`; no provider login/API inspection occurred |
| Local Vercel linkage | Ignored `.vercel/project.json` exists and contains local project/team linkage identifiers. The file cannot verify display name, framework, runtime, region, Git integration, branch, root directory, domains, or environment scopes without authenticated Vercel inspection. |
| Pre-existing worktree change | `.gitignore` was already modified before this task. It is user-owned and is not included in this task’s commit. |

### Local ignore-rule observation

The pre-existing `.gitignore` change adds `.env*` after the existing
`!.env.example` exception. Git consequently considers `.env.example` ignored
by that final glob, although the existing example remains tracked. This does
not expose a secret, but it can prevent a future replacement example file from
being added normally. Preserve the current user change for now; restore the
negation after `.env*` in a dedicated cleanup if the operator confirms that was
not intentional. `.env` and `.vercel/` remain ignored and untracked.

## Required environment matrix — names and scopes only

The CMS names below were derived from `.env.example` and source. “Presence” is
not independently verified because the Vercel CLI was unavailable and no secret
values or remote environment output was read.

| Project | Variable | Required scope | Presence / verification |
| --- | --- | --- | --- |
| CMS | `DATABASE_URL` | Production only; direct TLS Neon endpoint, not `-pooler` | Operator-reported; **UNVERIFIED** |
| CMS | `PAYLOAD_SECRET` | Production only; unique CMS secret | Operator-reported; **UNVERIFIED** |
| CMS | `NEXT_PUBLIC_SERVER_URL` | Production only; exact CMS HTTPS origin after domain verifies | Operator-reported; **UNVERIFIED** |
| CMS | `CORS_ORIGINS` | Production only; exact allowed browser origin(s), no wildcard | Operator-reported; **UNVERIFIED** |
| CMS | `R2_ENABLED` | Production only; must be `true` | Operator-reported; **UNVERIFIED** |
| CMS | `R2_BUCKET`, `R2_ENDPOINT` | Production only; dedicated bucket and private S3 endpoint | Operator-reported; **UNVERIFIED** |
| CMS | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Production only; scoped server-side write credentials | Operator-reported; **UNVERIFIED** |
| CMS | `R2_PUBLIC_BASE_URL` | Production only; intended media custom-domain origin | Operator-reported; **UNVERIFIED** |
| CMS | `PORTFOLIO_REVALIDATION_URL` | Production only; exact `/api/internal/revalidate` endpoint | Operator-reported; currently blocked by receiver `404` |
| CMS | `BLOG_REVALIDATION_SECRET` | Production only; shared HMAC secret | Presence **UNVERIFIED**; equality requires a later signed E2E test, never value comparison in logs |
| CMS | `CRON_SECRET` | Production only; distinct minimum-32-byte CMS Cron bearer secret | Operator-reported; **UNVERIFIED** |
| CMS | `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` | Controlled first deployment only; remove and redeploy immediately afterward | Must remain absent until fresh-target bootstrap; **NOT VERIFIED** |
| Portfolio | `PAYLOAD_CMS_URL` | Production only; server-side CMS HTTPS origin | Operator-reported; **UNVERIFIED** |
| Portfolio | `BLOG_REVALIDATION_SECRET` | Production only; must match CMS HMAC secret | Presence **UNVERIFIED**; endpoint currently absent from public deployment |

Preview must not share production Neon/R2/write-capable credentials. The CMS
fails closed if `NODE_ENV=production` has R2 disabled, so an interactive CMS
Preview needs its own non-production database/bucket and a non-production
portfolio receiver; otherwise restrict Preview to build validation. Vercel
scope assignments could not be inspected and remain a release blocker.

## Vercel, domains, and public endpoints

| Target | Expected | Observed read-only evidence | Status |
| --- | --- | --- | --- |
| CMS project | `cms-portfolio`, team `own-projects`, Next.js, Node 24.x, `iad1`, repository `lecav30/cms-portfolio`, branch `main`, root `.` | Operator-reported only. Local Vercel linkage exists, but no CLI/API was available to inspect settings. | UNVERIFIED |
| CMS Cron | `GET /api/internal/revalidation-jobs/run`, `17 3 * * *` UTC | `vercel.json` exactly declares that path/schedule. Deployment registration/invocation not tested. | SOURCE VERIFIED / DEPLOYMENT UNVERIFIED |
| CMS hostname | `cms.sebastianlevano.com` assigned to CMS project with TLS | DNS did not resolve during the check; HTTPS could not be reached. | BLOCKED |
| Media hostname | `media.sebastianlevano.com` mapped to production R2 custom domain | DNS resolved and HTTPS reached Cloudflare, but root returned `404`. This proves neither R2 bucket identity nor a media object lifecycle. | PARTIAL / UNVERIFIED |
| Portfolio receiver | `POST https://www.sebastianlevano.com/api/internal/revalidate` | Safe unauthenticated GET returned `404` from Vercel. The local source route exists, but public deployment does not currently expose it. | BLOCKED |

The receiver source requires the exact existing contract: JSON POST, timestamp
and HMAC headers, and success `204`. This preflight intentionally did not send
an authenticated request or attempt secret equality verification.

## Neon, R2, migrations, and jobs

### Neon

`DATABASE_URL` must use a direct TLS Neon endpoint while the Phase 8B runner
holds a session-level PostgreSQL advisory lock. A `-pooler` endpoint is not
accepted as production-ready without an explicit production-like lock test.
No production connection was opened, so target identity, PostgreSQL version,
role privileges, backup/branch/PITR setup, direct-vs-pooled endpoint, and
freshness remain **UNVERIFIED**.

The reviewed fresh-target migration order is unchanged:

1. `20261029_025459_phase_02_editorial_collections`
2. `20261029_032843_phase_03_r2_media_prefix`
3. `20261029_202955_phase_05_blog_revalidation_jobs`

The source inventory confirms that the chain creates the Payload auth/editorial
and version tables, `media.prefix`, then durable `payload_jobs`/
`payload_jobs_log` tables and indexes. The local push-managed
`cms_portfolio_dev` database continues to show all three as not run; that is
expected and is **not** permission to run them there. Production migration is
deferred to the separate, expressly authorized release step after direct-target
identity, fresh state, and backup/restore preflight are confirmed.

### R2

Source requires `R2_ENABLED=true` in production, all five R2 variables, a
Cloudflare S3 endpoint suffix, and an HTTPS public base URL. It stores public
media under the `media/` prefix and does not fall back to local storage in a
production runtime. No production R2 credentials, object, bucket metadata, or
custom-domain mapping were read or modified. DNS/TLS to the media hostname is
only partial evidence; an allowed fixture upload/fetch/replacement/deletion and
cleanup remains part of the later deployment smoke test.

### Jobs and revalidation

Phase 8B source/configuration is present: the dedicated cron path is GET-only,
requires a distinct `CRON_SECRET`, runs at most ten sequential jobs for the
dedicated queue/task, and uses a PostgreSQL advisory lock. Vercel Cron remains
best effort and does not retry failed invocations; live Cron health cannot be
established before CMS deployment. The existing generic Payload jobs endpoint
must not be exposed as an unauthenticated runner.

Even with the CMS runner prepared, the portfolio receiver’s observed public
`404` prevents successful signed publication invalidation. Deploy the
portfolio’s Phase 5A-compatible receiver before enabling production CMS
publication operations that rely on it.

## Commands and evidence boundaries

| Command / check | Result | Boundary |
| --- | --- | --- |
| `pwd`, `git status --short --branch`, `git log` | PASS | Confirmed CMS path, branch, and user-owned `.gitignore` change. |
| `vercel project inspect` | NOT RUN | CLI unavailable; no alternative authenticated provider access used. |
| CMS source/config/migration/cron review | PASS | Static repository evidence only. |
| Read-only DNS/HTTPS: CMS hostname | BLOCKED | DNS did not resolve. |
| Read-only DNS/HTTPS: media hostname | PARTIAL | Resolved/TLS reached Cloudflare; root `404` cannot prove production R2 mapping. |
| Read-only GET: public portfolio receiver | FAIL / BLOCKER | Vercel returned `404`, not a deployed route handler response. |
| Production Neon connection / migration status | NOT RUN | No production database credentials were read or used. |
| Production R2 lifecycle | NOT RUN | No production object write/delete was authorized. |
| CMS deployment / admin / REST / Cron | NOT RUN | Deployment is explicitly out of scope. |
| Signed production revalidation | NOT RUN | Requires deployed CMS and corrected receiver. |

### Local repository validation

| Command | Result | Evidence boundary |
| --- | --- | --- |
| `bun install --frozen-lockfile` | PASS | Lockfile check completed without changes. |
| `bun run typecheck` | PASS | Local static TypeScript validation only. |
| `bun run lint` | PASS | Local lint validation only. |
| `bun run build` with synthetic process-scoped configuration | PASS | The second build supplied only inert placeholder database/R2/webhook values; it proves compile-time configuration shape, not Neon, R2, Vercel, or secret validity. |
| `bun run validate:cron-runner` | PASS | Local deterministic authorization/bounds/lock validation. |
| `bun run validate:revalidation` | PASS | Local sender protocol validation. |
| `bun run validate:r2-config` | PASS | Local storage-selection/fail-closed validation. |
| `git diff --check` | PASS before commit | No whitespace errors in task-owned report. |

An initial ordinary local build detected ignored `.env.local`, `.env.production`,
and `.env` files but their values were not read or reported. The synthetic
rerun above overrides required process variables and is the only build result
used as preflight evidence.

## Ordered operator actions before release authorization

1. Install/authenticate the Vercel CLI or grant read-only dashboard inspection,
   then verify—not edit—the CMS project framework, Node 24.x, `iad1`, root `.`,
   repository/`main` integration, Production variable **names/scopes**, Preview
   isolation, domain binding, and registered cron entry.
2. Fix/complete the CMS Vercel domain binding until
   `cms.sebastianlevano.com` resolves and serves valid HTTPS. Do not deploy from
   this preflight task.
3. Deploy the portfolio revision containing `/api/internal/revalidate` through
   its own authorized release process, then confirm a safe unauthenticated GET
   gets the route’s expected method rejection rather than `404`. Keep its
   `PAYLOAD_CMS_URL` and shared-secret scope Production-only.
4. Using a read-only, controlled Neon preflight, confirm the direct TLS target
   is the new fresh production database, PostgreSQL compatibility, migration
   role, migration status, backup/branch/PITR recovery point, and abort plan.
   Do not migrate yet.
5. Confirm the media custom domain is attached to the intended production
   bucket and has active TLS. Leave the proof of object lifecycle to the later
   authorized smoke test.
6. Resolve the user-owned `.gitignore` ordering if its final `.env*` glob was
   not deliberate, then ensure `!.env.example` is last while `.env` and
   `.vercel/` remain ignored.
7. Only after all six actions are verified may a separate prompt authorize the
   one-time production migration and staged deployment/smoke runbook.

No production deployment approval is granted by this report.
