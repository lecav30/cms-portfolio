# Phase 8G — CMS production migration and deployment release gate

Date: 2026-10-31  
Repository: `lecav30/cms-portfolio`  
Branch / reviewed commit: `main` / `6d5765d` (`origin/main` matched)  
Scope: read-only production preflight. No production migration, deployment, administrator bootstrap, R2 write, DNS/provider change, or Git push was performed.

## Decision

**Gate A — READY FOR EXPLICIT MIGRATION AUTHORIZATION.** This is not authorization to migrate: no production write has been made.

The resumed read-only preflight verified the linked Vercel Production project, its current deployment, the required CMS variable names and Production-only scopes, and the fresh direct-TLS Neon target. The operator's correction is reflected in Vercel: `PORTFOLIO_REVALIDATION_URL` is present and `BLOG_REVALIDATION_URL` is absent from the Production list.

Gate B (configuration activation/any subsequent CMS deployment) remains a separate approval. The current Ready deployment is the reviewed `6d5765d` release, but environment edits made after that deployment must not be presumed active in its already-built runtime. Production R2 object delivery, matching webhook-secret delivery, cron invocation, and administrator bootstrap remain separate live checks after their respective approvals.

## Evidence collected

| Area | Result | Evidence and boundary |
| --- | --- | --- |
| Git release source | PASS | `main` and `origin/main` both point at `6d5765d`. Remote is `lecav30/cms-portfolio`. |
| Required local runtime | PASS | `nvm use 24.22.1` selected Node `v24.22.1`; Bun was `1.1.18`. The initially selected shell Node was `v24.14.1`, below the package engine, so all validation commands used Node `v24.22.1`. |
| CMS public hostname and deployment | PASS, limited | HTTPS `GET /` returned `200`. Vercel reports a Ready Production deployment of `lecav30/cms-portfolio` ref `main` at `6d5765d5837283753def1c878cde58e9e249f7de`, with `cms.sebastianlevano.com` listed as an alias. This does not prove the later environment edit is active in that existing deployment. |
| CMS public security smoke test | PASS, limited | `GET /admin` returned `200` (page reachability only); anonymous `GET /api/users` returned `403`; anonymous `GET /api/internal/revalidation-jobs/run` returned `401`; `/robots.txt` returned `200` and disallows `/admin/` and `/api/`. No authenticated API action was attempted. |
| Neon identity / freshness | PASS | A one-time `SELECT`-only direct-TLS query reached a non-local target: database `neondb`, role `neondb_owner`, PostgreSQL `18.6`. It is not `cms_portfolio_dev`, has no public tables, no `payload_migrations` table, and no recorded migrations. No schema/data write occurred. |
| R2 public hostname | BLOCKED | `media.sebastianlevano.com` resolved through Cloudflare and HTTPS worked, but a root request returned `404`. That is not proof of bucket-object delivery or custom-domain mapping. No production object was written. |
| Portfolio receiver | PASS, limited | Previously observed public `GET /blog` returned `200`; an unsigned `POST /api/internal/revalidate` returned `401`. This confirms receiver reachability and unsigned denial only, not shared-secret equality or valid delivery. |
| Vercel project configuration | PASS | Authenticated CLI inspection confirms project `cms-portfolio` under `own-projects`, Next.js, Node `24.x`, effective root `.`, region `iad1`, and a Ready Production deployment sourced from GitHub `lecav30/cms-portfolio` `main` at the reviewed SHA. |
| Vercel environment scopes | PASS | All source-required CMS runtime names are present in Production; Vercel reports no variables in Preview or Development. Values were not read. |
| Vercel Cron deployment | PARTIAL | Repository `vercel.json` declares `GET /api/internal/revalidation-jobs/run` at `17 3 * * *` (UTC), and anonymous denial is live. The deployed scheduler's first invocation/plan behavior remains unobserved. |

## Configuration contract and scope check

The following names are derived from `.env.example` and the CMS source. Values were never displayed.

| Variable(s) | Owner | Expected scope | Preflight status |
| --- | --- | --- | --- |
| `DATABASE_URL` | CMS | Production only; direct Neon TLS endpoint, never `-pooler` | Present in Vercel Production. The read-only query reached the direct non-local target; value/scope semantics beyond Vercel's Production label were not displayed. |
| `PAYLOAD_SECRET` | CMS | Production only | Present in Vercel Production; value was not read. |
| `NEXT_PUBLIC_SERVER_URL`, `CORS_ORIGINS` | CMS | Production | Both present in Vercel Production; values were not read. Local origin/allowlist checks found no wildcard. |
| `R2_ENABLED`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL` | CMS | Production only | All six are present in Vercel Production. Production object delivery remains unverified. |
| `PORTFOLIO_REVALIDATION_URL`, `BLOG_REVALIDATION_SECRET` | CMS | Production only | Both are present in Vercel Production. `BLOG_REVALIDATION_URL` is absent from the Production list. Source requires the destination to end in `/api/internal/revalidate`; values and equality with the portfolio secret were intentionally not read. |
| `CRON_SECRET` | CMS | Production only | Present in Vercel Production. It must remain independent from the Payload and webhook secrets and meet the source's 32-byte minimum; value was not read. |
| `PAYLOAD_CMS_URL`, `BLOG_REVALIDATION_SECRET` | Portfolio | Portfolio Production only | Expected from the read-only portfolio contract. Their Vercel Production presence/scope and the shared-secret match could not be inspected. |
| `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` | CMS | Not configured for routine production runtime | Absent from the local production-shaped file. First-admin bootstrap is deliberately a separately approved release action. |

The local ignored configuration remains evidence about that file only. Vercel now confirms names/scopes, not values or semantic correctness. Preview and Development have no project variables, so production Neon, production R2 write, webhook, and cron credentials are not configured there.

## Migration inventory and controlled plan

The ordered, reviewed migration chain is:

1. `20261029_025459_phase_02_editorial_collections`
2. `20261029_032843_phase_03_r2_media_prefix`
3. `20261029_202955_phase_05_blog_revalidation_jobs`

The fresh target has no migration tracking table, so the entire chain is pending. Production must use the reviewed migration runner (`bun run migrate`) once, from the exact released commit, with production `DATABASE_URL`; it must never use Payload push mode, `build:with-migrations`, or a Vercel build hook. `bun run migrate:status` and post-run read-only schema/migration verification should be recorded before proceeding to deployment.

### Gate A — database migration (requires explicit authorization)

Before this operation, the operator must confirm the exact fresh Neon target and authorize: “apply the three reviewed migrations to the approved fresh Neon production database.” Create/verify a Neon restore point or equivalent backup and record the target identity. Recheck direct TLS target, database name, role, zero-table state, and migration list immediately before running the approved command. Stop on drift, partial state, or any unreviewed migration. Do not rerun blindly.

If migration fails, do not use `migrate:down`, schema push, or SQL edits reflexively. Stop, preserve diagnostics without credentials, keep the CMS undeployed, and choose either a reviewed forward fix or Neon restore/branch recovery under a separate approval.

### Gate B — first CMS deployment (requires separate explicit authorization)

After a successful Gate A verification, the operator must separately authorize activation/deployment of the exact CMS Git SHA to the linked Vercel Production project. The current Ready deployment is already that reviewed SHA, but it must not be assumed to include environment edits made after its build. Verify Production-only variables by name/scope, correct root (`.`), Next.js framework, Node 24.x, `iad1`, domain association for `cms.sebastianlevano.com`, and the cron declaration before any deployment or redeployment.

Post-deploy, check only safe routes first: HTTPS, `/admin` page reachability, anonymous user/cron denial, robots, database-backed public API health, and Vercel runtime logs with secrets redacted. A valid signed webhook, scheduled cron execution, first administrator creation, and a production R2 write each remain separate approvals.

### Gate C — separately authorized live-data operations

Do not bootstrap an administrator, upload a R2 fixture, or send a valid signed revalidation event as part of Gates A or B. Each requires its own scoped operator approval, disposable-fixture/cleanup plan, and evidence. This protects the fresh production database and bucket from accidental content or account creation.

## Commands and local validation

| Command / check | Result | Notes |
| --- | --- | --- |
| `bun install --frozen-lockfile` | PASS | Lockfile was already coherent; no dependency changes. |
| `bun run typecheck` | PASS | Ran with Node `v24.22.1`. |
| `bun run lint` | PASS | No new lint findings. |
| `bun run validate:cron-runner` | PASS | Static/focused runner validation. |
| `bun run validate:revalidation` | PASS | Sender contract validation. |
| `bun run validate:r2-config` | PASS | Configuration validation only; no cloud operation. |
| `bun run build` | PASS | Used process-scoped synthetic non-production configuration. It compiled successfully; it does not verify deployed environment values, Neon connectivity, R2, or webhook delivery. |
| Read-only Neon identity/migration query | PASS | `SELECT`-only query described above; no migration/status runner used against production. |
| Public DNS/TLS/negative-auth smoke tests | PASS, limited | Results recorded in the evidence table; no authenticated or mutating requests. |
| Vercel project/deployment/domain/env inspection | PASS | Authenticated CLI verified the project, Production release SHA/ref, alias, Production variable names, and empty Preview/Development scopes. It did not display values. |
| Production migration/deploy | NOT RUN | Not authorized by this prompt. |

## Remaining operator actions, in order

1. Before Gate A, create/verify the Neon restore point or backup/recovery method for the freshly verified target.
2. Explicitly authorize Gate A against that exact fresh Neon database and the three named migrations. The exact authorization wording is requested below.
3. After successful migration verification, separately authorize Gate B activation/deployment so the corrected Production environment is unquestionably active in the CMS runtime.
4. Confirm the portfolio Production project has `PAYLOAD_CMS_URL` and the matching `BLOG_REVALIDATION_SECRET`, without exposing values, then separately authorize a valid signed delivery fixture.
5. Separately authorize production admin bootstrap, R2 lifecycle verification against `media.sebastianlevano.com`, and cron execution observation.

## Git hygiene

This task adds only this report. A pre-existing user change to `.gitignore` was intentionally left unstaged and unmodified; it adds broad `.env*` and `.vercel` ignore patterns, and should be reviewed separately because `.env*` also matches `.env.example` (already tracked, so not removed).

No push, deployment, migration, provider mutation, admin creation, or production R2 object operation occurred.
