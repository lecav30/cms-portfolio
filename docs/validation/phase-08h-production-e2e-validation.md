# Phase 8H — Production end-to-end validation preflight

Date: 2026-10-31  
Repository: `lecav30/cms-portfolio`  
Scope completed: Stage 0 read-only preflight only. No Gate H1 fixture, R2 object, editorial record, job execution, Cron invocation, webhook delivery, migration, deployment, environment/security setting, or Git push was performed.

## Gate status

| Gate | Status | Boundary |
| --- | --- | --- |
| Stage 0 — preflight | PASS | Production targets, deployment metadata, public route behavior, baseline counts, and runner constraints were inspected read-only. |
| Gate H1 — scoped editorial/media fixture | **AWAITING EXPLICIT AUTHORIZATION** | No production editorial or R2 write has occurred. |
| Gate H2 — authenticated Cron/job runner | **NOT AUTHORIZED / NOT TESTED** | The runner was not invoked. |

## Verified production targets

| Component | Result | Evidence |
| --- | --- | --- |
| CMS deployment | PASS | Vercel reports Ready Production deployment `cms-portfolio-iwtiltuw5-sebastianlevano.vercel.app`, aliased to `cms.sebastianlevano.com`, from `main` commit `6d5765d5837283753def1c878cde58e9e249f7de`. |
| Portfolio deployment | PASS | Vercel reports Ready Production deployment `portfolio-bw9p0vg0u-sebastianlevano.vercel.app`, aliased to `www.sebastianlevano.com`, from `main` commit `92b9c5987798b1ad4bc96cdd2ebc5ee346cb7b6f`. The portfolio repository was not modified. |
| Neon database | PASS | Direct-TLS read-only query reached non-local PostgreSQL `18.6`; all three reviewed migrations are recorded in batch `1`. No connection string, role, or credential is recorded here. |
| R2 hostname | PARTIAL | `media.sebastianlevano.com` served HTTPS and returned `404` at `/`, which is expected for a bucket root without an object and does not establish object delivery. An exact fixture URL is required under Gate H1. |
| CMS/portfolio config names | PASS, presence only | CMS Production contains `DATABASE_URL`, `PAYLOAD_SECRET`, `NEXT_PUBLIC_SERVER_URL`, `CORS_ORIGINS`, all six `R2_*` names, `PORTFOLIO_REVALIDATION_URL`, `BLOG_REVALIDATION_SECRET`, and `CRON_SECRET`. Portfolio Production contains `PAYLOAD_CMS_URL` and `BLOG_REVALIDATION_SECRET`. Values and equality of the shared secret were not read. `INITIAL_ADMIN_*` is absent, as expected. |

## Database baseline

The read-only production baseline was:

| Resource | Count |
| --- | ---: |
| Users | 1 |
| Categories | 0 |
| Tags | 0 |
| Media | 0 |
| Posts | 0 |
| Published posts | 0 |
| Draft posts | 0 |
| Durable job groups / jobs | 0 / 0 |

The recorded migration chain is exactly:

1. `20261029_025459_phase_02_editorial_collections`
2. `20261029_032843_phase_03_r2_media_prefix`
3. `20261029_202955_phase_05_blog_revalidation_jobs`

## Public endpoint and access preflight

| Check | Result | Observed status / boundary |
| --- | --- | --- |
| `GET /admin` | PASS | `200`; this checks reachability, not a logged-in browser session. |
| `GET /api/posts?limit=1` | PASS | `200`, with zero public documents and `totalDocs: 0`. |
| Anonymous `GET /api/users` | PASS | Payload returned `403`. |
| Anonymous `POST /api/posts` | PASS | Payload returned `403`; no document was created. |
| Portfolio `GET /blog` | PASS | `200`, with the expected empty-content behavior. |
| Unsigned portfolio revalidation POST | PASS | `401`; this confirms the receiver rejects unsigned requests only. |
| Public media hostname root | PARTIAL | HTTPS `404`; an object-level request is required to validate R2 delivery. |

The existing ignored local admin test-credential file is present with mode `0600`. Its values were not read into output. If Gate H1 is approved, it can be used only in memory to obtain an authenticated CMS session; tokens/cookies will be stored only in short-lived `0600` temporary files and removed after each test.

## Durable job and Cron safety assessment

`GET /api/internal/revalidation-jobs/run` accepts only an exact `Bearer CRON_SECRET`, then acquires a PostgreSQL advisory lock and runs at most **10** jobs sequentially. It filters to queue `blog-revalidation` and task `blog-revalidation`; it cannot run arbitrary Payload queues. The current baseline has no jobs.

Publishing a public post queues a durable revalidation event. The post hook also asks Next's `after()` mechanism to attempt the same bounded runner after the response. Therefore, a publish test can cause normal post-response delivery without manually calling the Cron endpoint. A direct authenticated Cron call must remain a separate Gate H2 decision: immediately before it, recheck that only the uniquely scoped fixture job is incomplete and no unrelated `blog-revalidation` job exists. Never use `revalidate:replay` against an unknown production queue.

## Candidate fixture plan for Gate H1

If approved, the test will generate one collision-resistant prefix of the form `phase-08h-<uuid>` and create a private `0600` manifest under `/private/tmp` containing only returned fixture IDs, slugs, media object key/URL, and cleanup state. It will not contain credentials, tokens, or arbitrary production identifiers.

1. Create one Category and one Tag using the prefix.
2. Upload one small approved PNG through authenticated Payload Media, with meaningful fixture alt text. Record the returned Media ID/key/URL; verify the exact `https://media.sebastianlevano.com/...` URL returns HTTPS `200` and an image content type.
3. Create one draft Post using the Category, Tag, optional cover Media, and a minimal representative Lexical document. Confirm direct public CMS detail/filter requests and the portfolio draft URL do not expose it.
4. Before publishing, record the fixture queue state. Publishing, public updates/moves, unpublish/delete, and signed delivery will proceed only when the approved scope explicitly includes the normal job side effect. If an authenticated Cron trigger is needed, stop at Gate H2 rather than calling it implicitly.
5. Cleanup uses only manifest IDs through authenticated CMS delete paths. It verifies baseline counts return to the values above. R2 deletion is checked through the exact fixture key only; no broad bucket listing/deletion is allowed.

The current baseline makes a narrow runner test possible later, but it does not remove the need to recheck jobs immediately before any Gate H2 invocation.

## Non-mutating validation

| Command | Result | Notes |
| --- | --- | --- |
| `bun install --frozen-lockfile` | PASS | No dependency or lockfile change. |
| `bun run typecheck` | PASS | Node `v24.22.1`. |
| `bun run lint` | PASS | No new findings. |
| `bun run validate:r2-config` | PASS | Static configuration behavior only; no R2 request. |
| `bun run validate:revalidation` | PASS | Sender contract/unit validation only. |
| `bun run validate:cron-runner` | PASS | Bounded queue/lock unit validation only. |
| `bun run build` | PASS | Process-scoped synthetic non-production values were used; this does not prove live provider behavior. |
| `bun run validate:r2-live` | NOT RUN | Would perform storage operations; Gate H1 has not been authorized. |
| `bun run validate:cron-runner-live` | NOT RUN | Could process a live job; Gate H2 has not been authorized. |

## Risks and operator decisions

- **H1 required:** approve only the scoped fixture creation and cleanup described above. This is the first authorized production write in Phase 8H.
- **H2 required separately:** an authenticated Cron request, replay, or any explicit job runner execution must not occur until the live queue is rechecked and the exact intended work is approved.
- **Deployment Protection:** current production public reads work at the CMS REST boundary, but no Phase 8H change was made to this policy. Keep Payload access controls as the enforcement layer for users and editorial mutations.
- **R2 deletion cache:** a stale CDN `200` after deletion is not proof the object remains. Object storage verification later must use the scoped fixture key.
- **No oversized upload:** the test will use one small valid image only; it will not reproduce the historical oversized-upload failure against production.

## Git

This report is the only intended tracked change for Stage 0. The pre-existing `.gitignore` modification remains unstaged and untouched. No push occurred.
