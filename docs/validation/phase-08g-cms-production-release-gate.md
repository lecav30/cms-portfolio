# Phase 8G — CMS production migration and deployment release gate

Date: 2026-10-31  
Repository: `lecav30/cms-portfolio`  
Branch / reviewed commit: `main` / `6d5765d` (`origin/main` matched)  
Scope: read-only production preflight. No production migration, deployment, administrator bootstrap, R2 write, DNS/provider change, or Git push was performed.

## Decision

**NO-GO for migration or deployment until the separate approval gates below are satisfied.**

The target database is fresh and the public CMS hostname is reachable, so the infrastructure is materially closer to release. However, the production Vercel configuration and environment scopes could not be inspected through the unavailable Vercel CLI, the local production-shaped configuration has a sender-variable mismatch, and neither real R2 object delivery nor a valid signed CMS-to-portfolio notification has been tested. Most importantly, this preflight is not authorization to write to Neon or deploy.

## Evidence collected

| Area | Result | Evidence and boundary |
| --- | --- | --- |
| Git release source | PASS | `main` and `origin/main` both point at `6d5765d`. Remote is `lecav30/cms-portfolio`. |
| Required local runtime | PASS | `nvm use 24.22.1` selected Node `v24.22.1`; Bun was `1.1.18`. The initially selected shell Node was `v24.14.1`, below the package engine, so all validation commands used Node `v24.22.1`. |
| CMS public hostname | PASS, limited | DNS resolved through Vercel and HTTPS `GET /` returned `200`. This demonstrates a reachable deployment, not its release SHA, project settings, healthy production configuration, or authenticated admin access. |
| CMS public security smoke test | PASS, limited | `GET /admin` returned `200` (page reachability only); anonymous `GET /api/users` returned `403`; anonymous `GET /api/internal/revalidation-jobs/run` returned `401`; `/robots.txt` returned `200` and disallows `/admin/` and `/api/`. No authenticated API action was attempted. |
| Neon identity / freshness | PASS | A one-time `SELECT`-only direct-TLS query reached a non-local target: database `neondb`, role `neondb_owner`, PostgreSQL `18.6`. It is not `cms_portfolio_dev`, has no public tables, no `payload_migrations` table, and no recorded migrations. No schema/data write occurred. |
| R2 public hostname | BLOCKED | `media.sebastianlevano.com` resolved through Cloudflare and HTTPS worked, but a root request returned `404`. That is not proof of bucket-object delivery or custom-domain mapping. No production object was written. |
| Portfolio receiver | PASS, limited | Previously observed public `GET /blog` returned `200`; an unsigned `POST /api/internal/revalidate` returned `401`. This confirms receiver reachability and unsigned denial only, not shared-secret equality or valid delivery. |
| Vercel project configuration | BLOCKED | The repository has an ignored local Vercel link, but the Vercel CLI was unavailable. The operator-reported project/team/framework/Node 24.x/root/`iad1`/Git integration/production branch/domain association/Production variable scopes could not be independently inspected. |
| Vercel Cron deployment | BLOCKED | Repository `vercel.json` declares `GET /api/internal/revalidation-jobs/run` at `17 3 * * *` (UTC); anonymous denial is live. Whether the schedule is accepted and invoked by the actual Vercel plan is unverified. |

## Configuration contract and scope check

The following names are derived from `.env.example` and the CMS source. Values were never displayed.

| Variable(s) | Owner | Expected scope | Preflight status |
| --- | --- | --- | --- |
| `DATABASE_URL` | CMS | Production only; direct Neon TLS endpoint, never `-pooler` | A local production-shaped configuration has a direct `sslmode=require` URL and the read-only query above succeeded. Vercel Production presence/scope is unverified. |
| `PAYLOAD_SECRET` | CMS | Production only | Local presence checked only; Vercel scope unverified. |
| `NEXT_PUBLIC_SERVER_URL`, `CORS_ORIGINS` | CMS | Production | Local origin/allowlist checks passed without a wildcard; Vercel scope unverified. |
| `R2_ENABLED`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL` | CMS | Production only | Local names are present and R2 is enabled; Vercel scope and production object delivery are unverified. |
| `PORTFOLIO_REVALIDATION_URL`, `BLOG_REVALIDATION_SECRET` | CMS | Production only | Source requires this exact URL variable to end in `/api/internal/revalidate`. The local production-shaped file lacks `PORTFOLIO_REVALIDATION_URL` and instead contains unsupported `BLOG_REVALIDATION_URL`; it would not configure the sender if copied to Vercel. Correct the Vercel Production name and remove the misleading unsupported name through the operator-controlled Vercel configuration before release. Secret equality with the portfolio remains unverified. |
| `CRON_SECRET` | CMS | Production only | Local name is present. It must be independent from the Payload and webhook secrets, at least 32 random bytes, and configured for Vercel Cron's Bearer header. Vercel scope/value is unverified. |
| `PAYLOAD_CMS_URL`, `BLOG_REVALIDATION_SECRET` | Portfolio | Portfolio Production only | Expected from the read-only portfolio contract. Their Vercel Production presence/scope and the shared-secret match could not be inspected. |
| `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` | CMS | Not configured for routine production runtime | Absent from the local production-shaped file. First-admin bootstrap is deliberately a separately approved release action. |

The local configuration result is evidence about the checked local ignored file only. It does not establish Vercel values or scopes. In particular, Preview must not receive production Neon, production R2 write, webhook, or cron credentials.

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

After a successful Gate A verification, the operator must separately authorize deployment of the exact CMS Git SHA to the linked Vercel Production project. Verify Production-only variables by name/scope, correct root (`.`), Next.js framework, Node 24.x, `iad1`, domain association for `cms.sebastianlevano.com`, and the cron declaration before deployment. Do not deploy from an unverified Vercel configuration.

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
| Vercel project/domain/env inspection | BLOCKED | No authenticated Vercel CLI available in this environment. |
| Production migration/deploy | NOT RUN | Not authorized by this prompt. |

## Remaining operator actions, in order

1. In the CMS Vercel Production environment, confirm the exact source-derived variable names and scopes. Replace any `BLOG_REVALIDATION_URL` setting with `PORTFOLIO_REVALIDATION_URL`; do not disclose values. Keep production credentials out of Preview.
2. Confirm the portfolio Production project has `PAYLOAD_CMS_URL` and the matching `BLOG_REVALIDATION_SECRET`, without exposing values.
3. In Vercel, confirm repository `lecav30/cms-portfolio`, branch `main`, root `.`, Next.js framework, Node 24.x, `iad1`, `cms.sebastianlevano.com` attachment, and that the `17 3 * * *` cron schedule is accepted by the selected plan.
4. Confirm the Neon restore/backup procedure and explicitly authorize Gate A against the fresh database identified above.
5. After the separately authorized migration succeeds, explicitly authorize Gate B deployment of the exact reviewed SHA.
6. After deployment, separately authorize production admin bootstrap, R2 lifecycle verification against `media.sebastianlevano.com`, valid signed revalidation delivery, and cron execution observation.

## Git hygiene

This task adds only this report. A pre-existing user change to `.gitignore` was intentionally left unstaged and unmodified; it adds broad `.env*` and `.vercel` ignore patterns, and should be reviewed separately because `.env*` also matches `.env.example` (already tracked, so not removed).

No push, deployment, migration, provider mutation, admin creation, or production R2 object operation occurred.
