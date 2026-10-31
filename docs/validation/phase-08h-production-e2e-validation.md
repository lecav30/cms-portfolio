# Phase 8H — Production end-to-end validation

Date: 2026-10-31
Repository: `lecav30/cms-portfolio` (`main`)
Scope: Stage 0 preflight and the explicitly authorized Gate H1 scoped editorial/media fixture test. No authenticated Cron invocation, replay, migration, deployment, provider-setting change, administrator change, or Git push was performed.

## Verdict

**BLOCKED — signed production cache revalidation is rejected by the portfolio receiver.**

The authorized fixture demonstrated production Media upload, R2 persistence, HTTPS public delivery, draft isolation, authenticated editorial creation, and exact fixture cleanup. Publishing queued durable jobs, and Payload's normal post-response runner attempted delivery without a direct Cron call. The receiver returned `401` on the failed attempts, so the public portfolio cache lifecycle could not be certified. This is consistent with a production shared-secret or receiver-configuration mismatch, but values were deliberately not read or compared.

## Gate status

| Gate | Status | Evidence / boundary |
| --- | --- | --- |
| Stage 0 — read-only preflight | PASS | Production targets, deployment metadata, public route behavior, baseline counts, and runner constraints were inspected read-only. |
| Gate H1 — scoped editorial/media fixture | PARTIAL / CLEANED | Only one uniquely prefixed fixture set was created and removed. Media, draft isolation, publish queueing, and exact cleanup passed; signed delivery/cache refresh is blocked by `401`. |
| Gate H2 — authenticated Cron/job runner | **NOT AUTHORIZED / NOT TESTED** | The route was not invoked and replay was not run. |

## Verified targets and baseline

| Component | Result | Evidence |
| --- | --- | --- |
| CMS deployment | PASS | Vercel reported Ready Production deployment `cms-portfolio-iwtiltuw5-sebastianlevano.vercel.app`, aliased to `cms.sebastianlevano.com`, from `main` commit `6d5765d5837283753def1c878cde58e9e249f7de`. |
| Portfolio deployment | PASS | Vercel reported Ready Production deployment `portfolio-bw9p0vg0u-sebastianlevano.vercel.app`, aliased to `www.sebastianlevano.com`, from `main` commit `92b9c5987798b1ad4bc96cdd2ebc5ee346cb7b6f`. The portfolio repository was not modified. |
| Neon database | PASS | A direct-TLS read-only query reached non-local PostgreSQL `18.6`; the three reviewed migrations are recorded in batch `1`. No DSN, role, or credential is recorded. |
| R2 hostname | PASS for fixture | The exact uploaded fixture URL on `media.sebastianlevano.com` returned HTTPS `200` with `image/png`. |
| CMS/portfolio config names | PASS, presence only | CMS Production contains the required database, Payload, R2, `PORTFOLIO_REVALIDATION_URL`, `BLOG_REVALIDATION_SECRET`, and `CRON_SECRET` names. Portfolio Production contains `PAYLOAD_CMS_URL` and `BLOG_REVALIDATION_SECRET`. Values and secret equality were not read. `INITIAL_ADMIN_*` is absent. |

The baseline and ending state for persistent editorial data are identical:

| Resource | Before | After |
| --- | ---: | ---: |
| Users | 1 | 1 |
| Categories | 0 | 0 |
| Tags | 0 | 0 |
| Media | 0 | 0 |
| Posts | 0 | 0 |
| Published posts | 0 | 0 |
| Draft posts | 0 | 0 |

The applied migration chain is:

1. `20261029_025459_phase_02_editorial_collections`
2. `20261029_032843_phase_03_r2_media_prefix`
3. `20261029_202955_phase_05_blog_revalidation_jobs`

## Stage 0 public security preflight

| Check | Result | Observed status / boundary |
| --- | --- | --- |
| CMS `GET /admin` | PASS | `200`; reachability only, not a browser login assertion. |
| CMS `GET /api/posts?limit=1` | PASS | `200`, zero public documents before the fixture. |
| Anonymous CMS `GET /api/users` | PASS | `403`. |
| Anonymous CMS `POST /api/posts` | PASS | `403`; no document was created. |
| Portfolio `GET /blog` | PASS | `200`, empty-content behavior before the fixture. |
| Unsigned portfolio revalidation POST | PASS | `401`; this proves unsigned rejection only. |
| Media hostname root | INCONCLUSIVE | HTTPS `404` at bucket root is expected and does not prove object delivery. |

## Gate H1 fixture execution

One collision-resistant `phase-08h-…` prefix was held in a private `0600` temporary manifest. It contained only returned fixture IDs, slugs, and the exact object key/URL—never credentials, tokens, or unrelated production identifiers. A short-lived authenticated header was also stored privately and was not logged.

| Step | Result | Observed evidence |
| --- | --- | --- |
| Create fixture taxonomy | PASS | Two uniquely prefixed Categories and one Tag were created through authenticated CMS APIs. The second Category was reserved for a planned move test and was removed unused once delivery failed. |
| Upload valid image | PASS | The small PNG was accepted through Payload's multipart REST contract (`_payload` plus `file`); returned metadata identified an HTTPS public URL and `image/png`. The creation-response status was not retained because a local zsh reserved-variable error occurred after the request; R2 and public retrieval independently prove the upload completed. |
| Exact R2 object check | PASS | Scoped `HeadObject` against only the returned key found a 68-byte `image/png` object. No bucket listing was used. |
| Public media delivery | PASS | The returned production custom-domain URL responded `200` with `Content-Type: image/png`. |
| Create draft Post | PASS | Authenticated REST creation returned `201`, status `draft`, with the fixture Category, Tag, Media, and minimal Lexical content. |
| Draft public isolation | PASS | Public CMS direct detail returned `404`; public slug filter returned `200` with `totalDocs: 0`; portfolio draft route returned `404`. |
| Publish Post | PASS | Authenticated REST update returned `200`, status `published`, and a `publishedAt` timestamp. |
| Normal post-response job handling | PASS as attempted | The hook enqueued the scoped durable revalidation work and used its normal bounded post-response runner. No direct Cron/replay/manual signature was used. |
| Signed delivery to portfolio | **FAIL / BLOCKED** | The scoped job log recorded failed delivery attempts with sanitized receiver status `401`. No shared-secret value was read or printed. |
| Portfolio cache lifecycle | **NOT CERTIFIED** | The retrieved category HTML contained the fixture title while the retrieved article-detail HTML did not. With failed signed delivery and dynamic/stale-while-revalidate behavior, this is not evidence of a correct cache invalidation path. No slug/category move, update, unpublish, or republish was attempted after the blocker. |
| Fixture record cleanup | PASS | Authenticated delete calls returned `200` for the Post, Media, both Categories, and Tag. Exact IDs were used; no broad deletion occurred. |
| Exact R2 object deletion | PASS | After deleting the Media record, the scoped `HeadObject` returned `404`. A CDN response was not used to infer storage deletion. |
| Baseline restoration | PASS | Exact fixture-row checks were all zero and editorial/media totals returned to the baseline above. |

## Durable job state and H2 boundary

After cleanup, two durable `blog-revalidation` jobs associated only with the deleted Phase 8H fixture remain pending, with three failed log attempts recorded. Their receiver failures classify as HTTP `401`; no raw job payload, stack trace, signature, or secret is included here. They contain no active Post, Category, Tag, Media, or R2 object fixture.

They were intentionally not replayed, deleted, or processed through `GET /api/internal/revalidation-jobs/run` because Gate H2 was not authorized. The runner is bounded to ten `blog-revalidation` tasks under a PostgreSQL advisory lock, but it must not be called on this queue until the signing configuration is corrected and the exact queued work is reviewed.

## Non-mutating validation

| Command | Result | Notes |
| --- | --- | --- |
| `bun install --frozen-lockfile` | PASS | No dependency or lockfile change. |
| `bun run typecheck` | PASS | Run with Node `v24.22.1`. |
| `bun run lint` | PASS | No new findings. |
| `bun run validate:r2-config` | PASS | Static configuration behavior only. |
| `bun run validate:revalidation` | PASS | Sender contract/unit validation only. |
| `bun run validate:cron-runner` | PASS | Bounded queue/lock unit validation only. |
| `bun run build` | PASS | Used process-scoped synthetic non-production values; it does not validate live providers. |
| `bun run validate:r2-live` | NOT RUN | The existing script has broader live operations; the focused H1 path above was used instead. |
| `bun run validate:cron-runner-live` | NOT RUN | Would execute production jobs and requires Gate H2. |

## Required next actions

1. Operator: verify—without sending values in chat—that Production `BLOG_REVALIDATION_SECRET` has the exact same value in the CMS and portfolio Vercel projects, and that the CMS `PORTFOLIO_REVALIDATION_URL` points to the deployed portfolio receiver path.
2. Operator: redeploy whichever project receives the corrected Production environment value, if Vercel requires a redeploy for that variable to take effect. No application code change is indicated by this test.
3. Re-run a read-only check of the fixture-specific job queue. Do not replay unknown jobs.
4. If desired, grant a new scoped authorization that names which pending fixture jobs may be processed, or repeat the full fixture test with a fresh prefix after the configuration correction. Any direct authenticated Cron invocation remains Gate H2 and requires separate approval.

## Risks and boundaries

- Secret equality cannot be verified by presence-only checks. A successful signed delivery is the necessary end-to-end proof.
- Portfolio routes inherit a dynamic root layout and use tagged/stale-while-revalidate fetching. A first request after a valid invalidation is not proof of instant freshness; a follow-up bounded observation is required.
- The historical oversized-upload failure was not reproduced. This validation used one small allowed PNG only.
- No migrations, deployments, R2/provider configuration changes, administrator changes, signed manual webhook requests, Cron calls, or replay commands were made.

## Git

The only intended tracked change is this report. The pre-existing `.gitignore` modification remains unstaged and untouched. No push occurred.
