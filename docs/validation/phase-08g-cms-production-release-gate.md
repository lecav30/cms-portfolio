# Phase 8G — CMS production migration and deployment release gate

Date: 2026-10-31  
Repository: `lecav30/cms-portfolio`  
Branch / reviewed commit: `main` / `6d5765d` (`origin/main` matched)  
Scope: controlled Gate A migration release, Gate B Production redeployment, and Gate C first-administrator bootstrap/authentication validation. No R2 write, DNS/provider configuration change, signed webhook, Cron execution, or Git push was performed.

## Decision

**Gate A and Gate B — COMPLETE. Gate C — PARTIALLY COMPLETE.** The operator explicitly authorized the reviewed migration chain, Production deployment, and one controlled bootstrap redeploy. All three migrations completed successfully in batch 1; exactly one first administrator was created; and Payload login/access controls were verified through Vercel's authenticated deployment-protection bypass.

The resumed read-only preflight verified the linked Vercel Production project, its current deployment, the required CMS variable names and Production-only scopes, and the fresh direct-TLS Neon target. The operator's correction is reflected in Vercel: `PORTFOLIO_REVALIDATION_URL` is present and `BLOG_REVALIDATION_URL` is absent from the Production list.

The new Ready deployment is the reviewed `6d5765d5837283753def1c878cde58e9e249f7de` release from `main`. It was redeployed after the Production environment correction, so it receives the current scoped Production configuration. The secret values and a valid signed sender request were deliberately not read/tested. Production R2 object delivery, matching webhook-secret delivery, cron invocation, and post-bootstrap restart validation remain separate live checks after their respective approvals.

## Evidence collected

| Area | Result | Evidence and boundary |
| --- | --- | --- |
| Git release source | PASS | `main` and `origin/main` both point at `6d5765d`. Remote is `lecav30/cms-portfolio`. |
| Required local runtime | PASS | `nvm use 24.22.1` selected Node `v24.22.1`; Bun was `1.1.18`. The initially selected shell Node was `v24.14.1`, below the package engine, so all validation commands used Node `v24.22.1`. |
| CMS public hostname and deployment | PASS, limited | HTTPS `GET /` returned `200`. Vercel reports a Ready Production deployment of `lecav30/cms-portfolio` ref `main` at `6d5765d5837283753def1c878cde58e9e249f7de`, with `cms.sebastianlevano.com` listed as an alias. This does not prove the later environment edit is active in that existing deployment. |
| CMS public security smoke test | PASS, limited | `GET /admin` returned `200` (page reachability only); anonymous `GET /api/users` returned `403`; anonymous `GET /api/internal/revalidation-jobs/run` returned `401`; `/robots.txt` returned `200` and disallows `/admin/` and `/api/`. No authenticated API action was attempted. |
| Neon identity / freshness | PASS | Immediately before migration, a direct-TLS query reached non-local database `neondb` as `neondb_owner` on PostgreSQL `18.6`. It was not `cms_portfolio_dev`, had no public tables, and had no recorded migrations. |
| Authorized migration execution | PASS | `bun run migrate` applied exactly the three reviewed migrations in order. No schema push, down migration, reset, deployment, R2 operation, or admin bootstrap was used. |
| Post-migration state | PASS | `migrate:status` reports all three migrations ran in batch 1. Read-only checks confirm `users`, `categories`, `tags`, `media`, `posts`, `payload_jobs`, and `payload_jobs_log` exist. |
| R2 public hostname | BLOCKED | `media.sebastianlevano.com` resolved through Cloudflare and HTTPS worked, but a root request returned `404`. That is not proof of bucket-object delivery or custom-domain mapping. No production object was written. |
| Portfolio receiver | PASS, limited | Previously observed public `GET /blog` returned `200`; an unsigned `POST /api/internal/revalidate` returned `401`. This confirms receiver reachability and unsigned denial only, not shared-secret equality or valid delivery. |
| Vercel project configuration | PASS | Authenticated CLI inspection confirms project `cms-portfolio` under `own-projects`, Next.js, Node `24.x`, effective root `.`, region `iad1`, and a Ready Production deployment sourced from GitHub `lecav30/cms-portfolio` `main` at the reviewed SHA. |
| Vercel environment scopes | PASS | All source-required CMS runtime names are present in Production; Vercel reports no variables in Preview or Development. Values were not read. |
| Vercel Cron deployment | PARTIAL | Repository `vercel.json` declares `GET /api/internal/revalidation-jobs/run` at `17 3 * * *` (UTC), and anonymous denial is live. The deployed scheduler's first invocation/plan behavior remains unobserved. |
| Authorized CMS Production redeploy | PASS | Vercel rebuilt the existing immutable `origin/main` source at `6d5765d5837283753def1c878cde58e9e249f7de`; the new Production deployment reached `Ready` and is aliased to `cms.sebastianlevano.com`. Local documentation-only commits and the unrelated dirty `.gitignore` were not uploaded. |
| Post-deploy HTTPS/security smoke checks | PASS | `/` and `/admin` returned `200`; anonymous `GET /api/users` and anonymous `POST /api/users` returned `403`; unsigned `GET /api/internal/revalidation-jobs/run` returned `401`; `/robots.txt` returned `200` and disallows `/admin/` and `/api/`. |
| Gate C bootstrap preflight | PASS | Direct-TLS read-only check found zero Users. `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` were present in Vercel Production only; the local ignored test-credential file was mode `0600` and key presence was checked without reading values into output. |
| Gate C first administrator creation | PASS | The single authorized bootstrap redeploy reached Ready. Before a Payload request, Users count was `0`; after an authenticated Vercel-bypass request reached Payload, the count was exactly `1`. |
| Gate C login and authenticated API | PASS, protected path | Valid Payload login returned `200`; an invalid-password login returned `401`; authenticated `GET /api/users` returned `200` with one document. Credentials, token, cookie, email, and response body were never logged; temporary session artifacts were removed. |
| Gate C anonymous API restrictions | PASS, protected path | Through the Vercel bypass, anonymous `GET /api/users` and anonymous `POST /api/users` both returned Payload `403`. |
| Gate C public access / restart non-repetition | BLOCKED | Direct public CMS requests now receive Vercel Authentication `302` before Payload; `/admin` also redirects to Vercel SSO. The one-time variables have been removed from Vercel Production, but no subsequent deployment/restart was authorized, so persistence/no-duplicate behavior after restart remains untested. |

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

TLS maintenance note: the current `pg` dependency warns that its present `sslmode=require` handling aliases to hostname-verifying TLS, while a future major version will follow libpq semantics. No TLS verification was disabled for this release. Before upgrading to that major dependency line, explicitly review using `sslmode=verify-full` in the operator-controlled database URL.

## Migration inventory and controlled plan

The ordered, reviewed migration chain is:

1. `20261029_025459_phase_02_editorial_collections`
2. `20261029_032843_phase_03_r2_media_prefix`
3. `20261029_202955_phase_05_blog_revalidation_jobs`

Before Gate A, the fresh target had no migration tracking table and the entire reviewed chain was pending. It now records all three migrations in batch 1. Production used the reviewed runner (`bun run migrate`) from the reviewed release and did not use Payload push mode, `build:with-migrations`, or a Vercel build hook. Do not rerun this baseline chain; begin any later migration work with `bun run migrate:status` and a separate review.

### Gate A — database migration (completed)

The operator authorized: “apply the three reviewed CMS migrations to the verified fresh Neon production database, and no deployment.” Immediately before execution, a direct-TLS query confirmed `neondb`, `neondb_owner`, zero public tables, and no migration records. Payload then applied the three named migrations once. The subsequent status command recorded each in batch 1.

If migration fails, do not use `migrate:down`, schema push, or SQL edits reflexively. Stop, preserve diagnostics without credentials, keep the CMS undeployed, and choose either a reviewed forward fix or Neon restore/branch recovery under a separate approval.

### Gate B — first CMS deployment (completed)

The operator separately authorized a Production CMS deployment. Vercel redeployed the existing immutable deployment source from GitHub `lecav30/cms-portfolio` `main` at `6d5765d5837283753def1c878cde58e9e249f7de`; the new deployment reached `Ready` in `iad1` and carries `cms.sebastianlevano.com` as an alias. This source commit was already available on `origin/main`. The three newer local commits are report-only and were intentionally not pushed or deployed. The unrelated `.gitignore` change was also excluded.

Post-deploy, check only safe routes first: HTTPS, `/admin` page reachability, anonymous user/cron denial, robots, database-backed public API health, and Vercel runtime logs with secrets redacted. A valid signed webhook, scheduled cron execution, first administrator creation, and a production R2 write each remain separate approvals.

### Gate C — first administrator bootstrap and authentication (partially completed)

The existing guarded `onInit` path requires both `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`, counts Users with access override, and creates an account only if the count is zero. The operator provisioned the two values in Vercel Production only and separately authorized exactly one redeploy. A direct preflight observed zero users; after a Payload request using Vercel's authenticated protection bypass, the count was exactly one.

Payload authentication was tested without disclosing credentials: valid login returned `200`; invalid password returned `401`; a token derived in memory was used for authenticated Users access (`200`, one document); and anonymous Users read/create calls were rejected (`403`) when assessed behind the same deployment-protection bypass. Temporary token/cookie/response files were removed after the checks.

Immediately after validation, `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` were removed from Vercel Production. No redeploy followed, by instruction. Consequently the current immutable deployment may still retain its original bootstrap environment until it is replaced; this is not a credential disclosure, but it means non-repetition has not yet been proven. A separately authorized clean redeploy is required to verify that the existing administrator remains usable and the count remains one.

**Deployment-protection blocker:** direct requests to the current production CMS now receive Vercel Authentication `302` before reaching Payload, including `/admin` and `/api/users`. This protects the CMS browser surface, but it also blocks the portfolio's required anonymous published-content REST reads. The bypass-based tests prove Payload behavior only; they do not make the public API reachable. Review Vercel Deployment Protection/SSO policy in a separate approved configuration task before portfolio production integration can be declared ready.

### Separately authorized remaining live-data operations

The first-administrator bootstrap is complete. Do not upload an R2 fixture, send a valid signed revalidation event, execute a Cron job, or create further editorial data without its own scoped operator approval, disposable-fixture/cleanup plan, and evidence.

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
| Pre-migration Neon identity/migration query | PASS | Direct-TLS `SELECT`-only preflight confirmed the empty approved target immediately before execution. |
| `bun run migrate:status` before migration | PASS | All three reviewed migrations were pending. |
| `bun run migrate` | PASS | Applied the three reviewed migrations in order to the explicitly authorized fresh target. |
| `bun run migrate:status` after migration | PASS | All three migrations show `Ran: Yes`, batch `1`. |
| Read-only post-migration schema query | PASS | Expected editorial and Payload jobs tables exist; migration records match the reviewed chain. |
| Public DNS/TLS/negative-auth smoke tests | PASS, limited | Results recorded in the evidence table; no authenticated or mutating requests. |
| Vercel project/deployment/domain/env inspection | PASS | Authenticated CLI verified the project, Production release SHA/ref, alias, Production variable names, and empty Preview/Development scopes. It did not display values. |
| Production migration | PASS | Explicitly authorized Gate A applied the three reviewed migrations once and post-run status/schema checks passed. |
| CMS Production redeploy | PASS | Authorized redeploy of the immutable `origin/main` source reached `Ready`; it used the existing CMS project and Production configuration. |
| Production HTTPS/admin/anonymous-security checks | PASS | Root and `/admin` are reachable over HTTPS; anonymous Users reads/writes and unsigned Cron execution are denied as expected. |
| Controlled bootstrap redeploy | PASS | The one authorized redeploy reached Ready and bootstrapped exactly one administrator. |
| Valid / invalid Payload login | PASS | `200` / `401`, respectively, through the authorized deployment-protection bypass. |
| Authenticated / anonymous Users API | PASS, protected path | Authenticated `GET` was `200` with one document; anonymous `GET` and `POST` were `403` behind the same bypass. |
| Bootstrap variable removal | PASS | Both `INITIAL_ADMIN_*` names were removed from Vercel Production; no follow-up deployment occurred. |
| Post-removal restart / public CMS REST reachability | BLOCKED | Requires separate deployment authorization; direct public API requests currently receive Vercel Authentication `302`. |

## Remaining operator actions, in order

1. Record/verify the Neon restore point or backup/recovery method for the now-migrated target. It was not independently inspected during this CLI run and remains an operational follow-up.
2. Gate A is complete. Do not rerun the migration chain: future checks must begin with `bun run migrate:status` and stop on drift.
3. Gate B is complete. Monitor the Ready deployment and do not run migrations again unless a separately reviewed future migration is introduced.
4. If desired, separately authorize one clean Production redeploy after bootstrap-variable removal. Verify valid admin login, no duplicate creation, and a final Users count of one; do not re-add bootstrap variables.
5. Separately authorize a review/change of Vercel Deployment Protection so required public published-content CMS REST reads can reach Payload while administration remains protected.
6. Confirm the portfolio Production project has `PAYLOAD_CMS_URL` and the matching `BLOG_REVALIDATION_SECRET`, without exposing values, then separately authorize a valid signed delivery fixture.
7. Separately authorize R2 lifecycle verification against `media.sebastianlevano.com` and cron execution observation.

## Git hygiene

This task adds only this report. A pre-existing user change to `.gitignore` was intentionally left unstaged and unmodified; it adds broad `.env*` and `.vercel` ignore patterns, and should be reviewed separately because `.env*` also matches `.env.example` (already tracked, so not removed).

The only production mutations in this release were the explicitly authorized three-migration batch, the Vercel redeployment of the existing reviewed source, creation of exactly one first administrator by the guarded bootstrap, and removal of the two one-time Vercel bootstrap variables. No R2 object operation, signed webhook, Cron execution, DNS/provider configuration change, or push occurred.
