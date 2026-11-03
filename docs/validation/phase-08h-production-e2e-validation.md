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

## Phase 8H1 — 2026-11-01 production `401` diagnosis

### Contract and response-layer findings

The CMS and portfolio source contracts are compatible:

- CMS `src/revalidation/delivery.ts` signs HMAC-SHA256 over the exact UTF-8
  bytes `<timestamp>.<JSON body>`, prefixes the lowercase digest with
  `sha256=`, and sends the exact bytes it signs.
- Portfolio `src/services/blogRevalidation/crypto.ts` constructs the same
  bytes, requires the same signature format, and uses a length check plus a
  timing-safe comparison.
- Both sides require `BLOG_REVALIDATION_SECRET` to be at least 32 UTF-8 bytes.
  CMS validates `PORTFOLIO_REVALIDATION_URL` as HTTPS and exactly
  `/api/internal/revalidate`.

The live unsigned request returned the receiver route's JSON `401`
`{"error":"Unauthorized"}`, with JSON content type and `Cache-Control: no-store`.
It had no Vercel Deployment Protection response header. This distinguishes the
observed failure from Vercel protection and places it in the receiver's
timestamp/signature validation path. It is not a successful signed probe.

### Configuration and deployment observations

| Check | Result | Boundary |
| --- | --- | --- |
| CMS Production project | PASS | `cms-portfolio` is Next.js, Node `24.x`, `iad1`; its active Production deployment is Ready and aliases `cms.sebastianlevano.com`. |
| Portfolio Production project | PASS | `portfolio` is Next.js, Node `24.x`; its active Production deployment is Ready and aliases `www.sebastianlevano.com`. |
| CMS Production key names/scopes | PASS | `PORTFOLIO_REVALIDATION_URL` and `BLOG_REVALIDATION_SECRET` are present and Production-only. The obsolete `BLOG_REVALIDATION_URL` is absent. |
| Portfolio Production key names/scopes | PASS | `PAYLOAD_CMS_URL` and `BLOG_REVALIDATION_SECRET` are present and Production-only. |
| CMS local production configuration shape | PASS | The private local deployment configuration resolves to HTTPS, host `www.sebastianlevano.com`, path `/api/internal/revalidate`, and has no credentials, query, or hash. |
| Remote CMS URL value | UNVERIFIED | Vercel's read-only listing exposes the `PORTFOLIO_REVALIDATION_URL` key but not a safely usable decoded Config value through this session. The active runtime value cannot be inferred from local configuration. |
| Shared secret equality | UNVERIFIED | Both values are Vercel Secrets. Presence and creation age cannot establish equality, and neither value was read, logged, or compared. |
| Deployment activation after any last variable edit | UNVERIFIED | Both active deployments are Ready and were created during the same two-day window as the Production variables, but read-only metadata cannot prove which value revision was injected. A post-change redeploy is required. |

### Root-cause assessment

**Unconfirmed; highest-confidence cause is mismatched or not-yet-activated
`BLOG_REVALIDATION_SECRET` values.** The source signing formats match, the
receiver route—not Deployment Protection—returned the `401`, and the CMS
configuration names are correct. A wrong active remote destination or an
exceptional clock-skew problem cannot be ruled out without a future authorized
signed delivery, so neither is claimed resolved.

### Read-only job inventory and recovery safety

The current production `blog-revalidation` queue contains exactly these two
records, with no unrelated jobs:

| Job ID | Operation | Pending | Error flag | Attempts |
| ---: | --- | --- | --- | ---: |
| 1 | `publish` | Yes | Yes | 3 |
| 2 | `delete` | Yes | No | 2 |

Both reference only the already-deleted Phase 8H fixture. Reprocessing them
after correcting the receiver configuration is idempotent cache invalidation:
the former publish location and its subsequent delete location should both
resolve to the current public absence of the fixture. No Post, Media, R2
object, Category, or Tag will be recreated by a job. Do not manually delete
the records before confirming delivery; they are the bounded recovery evidence.

The existing `bun run revalidate:replay` resets failed jobs in the whole
`blog-revalidation` queue and then runs the same bounded queue runner. It does
not accept individual job IDs. It is currently safe *only if* the inventory
above is rechecked immediately before use and still contains only IDs `1` and
`2`; otherwise it must not be used. `GET /api/internal/revalidation-jobs/run`
also processes up to ten matching jobs and must remain uncalled without Gate H2.

### Operator-only configuration procedure

Do this in the Vercel dashboard without pasting a value into chat, a terminal
command, or a repository file:

1. Generate one new random shared secret of at least 32 bytes in a private
   password manager or other secure local tool. Do not reuse `CRON_SECRET` or
   `PAYLOAD_SECRET`.
2. In **portfolio → Settings → Environment Variables**, replace the
   **Production-only Secret** `BLOG_REVALIDATION_SECRET` with that value, then
   create a new Production deployment of the existing approved portfolio
   source. Do not change `PAYLOAD_CMS_URL`.
3. In **cms-portfolio → Settings → Environment Variables**, set the
   **Production-only Secret** `BLOG_REVALIDATION_SECRET` to exactly the same
   value. Confirm the **Production-only Config**
   `PORTFOLIO_REVALIDATION_URL` is exactly
   `https://www.sebastianlevano.com/api/internal/revalidate`, with no query,
   fragment, credentials, or trailing whitespace. Create a new Production
   deployment of the existing approved CMS source.
4. Confirm both deployments are Ready and were created after their respective
   variable updates. Do not run Cron, replay, or create fixtures during the
   brief mixed-secret window.

This is an operator configuration/deployment action and was not performed in
this diagnostic phase.

### Required separate authorization gates

After the operator confirms the configuration/redeploys are complete, provide
one explicit authorization at a time:

- **Gate H2 — scoped recovery:** authorize execution of only the current
  `blog-revalidation` jobs **1** and **2**, after a fresh queue inventory shows
  no other jobs. This permits the bounded runner/replay path and signed
  delivery observation; it does not permit fixture creation or Cron execution
  against an unknown queue.
- **Gate H3 — controlled retest:** separately authorize a new uniquely
  prefixed production editorial/media fixture and cleanup, including publish,
  update/move, unpublish, delete, and normal post-response job handling. This
  is required to prove current/previous path invalidation and cache freshness.

Recovery succeeds only when the receiver returns `204`, the scoped jobs leave
the queue without a new failed delivery, and the portfolio subsequently serves
the expected current or absent public paths. A valid signed request is the only
end-to-end confirmation that the secrets and active deployments match.

### H1 diagnostic validation

| Command | Result | Notes |
| --- | --- | --- |
| CMS `bun install --frozen-lockfile` | PASS | No dependency change. |
| CMS `bun run typecheck` | PASS | Node `v24.22.1`. |
| CMS `bun run lint` | PASS | No new findings. |
| CMS `bun run validate:revalidation` | PASS | Sender contract/lifecycle validation only. |
| Portfolio `bun install --frozen-lockfile` | PASS | Read-only validation in the sibling repository. |
| Portfolio `bun run validate:blog-revalidation` | PASS | Receiver contract/cache-target validation only. |
| Production signed request | NOT RUN | Requires Gate H2 or a separately approved scoped live test. |

The portfolio repository was not modified. Its pre-existing local branch state
was observed but not altered.

## Phase 8H2 — 2026-11-02 read-only deployed-authentication diagnosis

### Active project and deployment evidence

| Project | Production branch | Active deployment | Created | Source commit | Result |
| --- | --- | --- | --- | --- | --- |
| CMS `cms-portfolio` | `main` | `dpl_AaewWuzfTqhmZTVfBmRNfuwRqkXH` | `2026-10-31T03:07:36Z` | `6d5765d5837283753def1c878cde58e9e249f7de` | Ready; aliases `cms.sebastianlevano.com`. |
| Portfolio `portfolio` | `main` | `dpl_AciviNWQsSqUZAtUU7kb5o5qHZ2P` | `2026-10-30T22:33:49Z` | `92b9c5987798b1ad4bc96cdd2ebc5ee346cb7b6f` | Ready; aliases `www.sebastianlevano.com`. |

Vercel project metadata confirms that both projects are linked to their
expected GitHub repositories and use `main` as their Production branch. The
CMS active deployment is Node `24.x` in `iad1`; the portfolio active deployment
is Node `24.x` in `iad1`.

The CMS commits after deployed commit `6d5765d` change only validation
documentation. The deployed CMS `delivery.ts` contains the same HMAC signing,
timestamp, lowercase `sha256=` prefix, raw-byte body, and JSON content-type
logic reviewed locally. The deployed portfolio receiver commit contains the
same timestamp validation and timing-safe signature verification path.

### Environment activation evidence

| Project / key | Provider type / scope | Last update | Relation to active deployment |
| --- | --- | --- | --- |
| CMS `PORTFOLIO_REVALIDATION_URL` | Encrypted Config / Production | `2026-10-31T02:17:59Z` | Updated **before** the CMS deployment at `03:07:36Z`. |
| CMS `BLOG_REVALIDATION_SECRET` | Secret / Production | `2026-10-30T21:57:15Z` | Created **before** the CMS deployment. |
| Portfolio `BLOG_REVALIDATION_SECRET` | Secret / Production | `2026-10-30T22:31:17Z` | Created **before** the portfolio deployment at `22:33:49Z`. |

This rules out the previously suspected stale-deployment explanation: each
active Production deployment was created after the corresponding relevant
variable revision. It does not reveal secret values or prove their byte-for-byte
equality.

Vercel exposes the CMS destination as an encrypted Config value, and exposes
both `BLOG_REVALIDATION_SECRET` values only as non-readable Secrets. Its
read-only CLI/API does not provide a supported equality comparison of the
values actually injected into these deployments. The safe result is therefore
**UNVERIFIABLE**, not `MATCH` or `MISMATCH`. No secret, hash, fingerprint, or
value was printed, saved, or compared.

The local ignored production configuration has the expected destination shape
(`https`, `www.sebastianlevano.com`, `/api/internal/revalidate`, no credentials,
query, or fragment). This is supporting evidence only; it is not a claim about
the active remote encrypted Config value.

### Alternative-cause assessment

| Candidate | Assessment | Evidence / limitation |
| --- | --- | --- |
| Stale source or deployment environment | RULED OUT | Active deployments postdate relevant Production variable updates, and deployed commits contain the reviewed protocol code. |
| Vercel Deployment Protection | RULED OUT | An unsigned request returned the receiver route's JSON `401` with `Cache-Control: no-store`, JSON content type, and no protection header. |
| Sender/receiver byte-format disagreement | UNLIKELY | Deployed source matches on timestamp plus literal dot, raw JSON bytes, lowercase `sha256=` hex, and accepted JSON content type. Both local contract validators pass. |
| Material clock skew | UNLIKELY | Public Date headers from CMS and portfolio differed from the local clock by zero and one second respectively. This is not a direct Lambda-clock measurement, but gives no evidence of a timestamp-window failure. |
| Remote destination differs from expected receiver | UNRESOLVED | The active Config value is encrypted and cannot be decoded through a safe read-only interface. |
| Exact shared-secret bytes differ | UNRESOLVED / MOST LIKELY REMAINING CAUSE | Receiver `401` can result from an HMAC mismatch. Vercel cannot safely read back Secret values; whitespace differences would also be byte differences because both implementations use the original secret bytes for HMAC. |

The production `401` cause is therefore **unresolved**, with stale activation,
source drift, deployment protection, and practical clock skew eliminated as
primary explanations. It is not correct to assert a secret mismatch without a
successful/failed authorized signed delivery or an operator's private
out-of-band confirmation.

### Read-only queue snapshot

No job, Cron, replay, webhook, database, R2, migration, or deployment action
was performed in Phase 8H2. The fresh read-only queue inventory contains only
the same fixture-scoped jobs:

| Job ID | Operation | Pending | Error flag | Attempts |
| ---: | --- | --- | --- | ---: |
| 1 | `publish` | Yes | Yes | 3 |
| 2 | `delete` | Yes | Yes | 3 |

The second job's attempt/error state changed after the prior report without a
direct Cron or replay invocation from this session. Its execution source is not
proven by the job table alone; this report records only the observed state. Both
jobs remain safe recovery candidates because they reference the already-deleted
fixture and can only invalidate cache locations.

### Minimal follow-up recommendation

No secret rotation or environment edit is justified by this read-only evidence
alone. The smallest decisive next action is a separately authorized **Gate H2
scoped recovery test**:

> I authorize Gate H2: after a fresh read-only inventory confirms that
> `blog-revalidation` contains only jobs `1` and `2`, run the existing bounded
> replay/runner once against those jobs, observe only the resulting delivery
> status and public absence of the deleted fixture, and do not create fixtures,
> invoke the cron route, or alter environment variables.

The current replay script is queue-scoped rather than ID-scoped: it resets
failed jobs on `blog-revalidation` and invokes the bounded runner. The required
pre-run inventory check is what makes that operation narrow enough here. A
`204` delivery and cleared/scoped completed jobs would confirm the currently
active deployment configuration without a secret change.

If that authorized test returns `401` again, the operator should first use the
private original secret source (for example, a password manager) to re-save the
same exact bytes in both Production `BLOG_REVALIDATION_SECRET` entries and
confirm the CMS Config destination in the Vercel dashboard, then redeploy
portfolio followed by CMS. A new secret is needed only if the original value is
unavailable or a rotation is otherwise desired. That configuration/deployment
work remains a separate authorization.

### H2 diagnostic validation

| Check | Result |
| --- | --- |
| CMS `bun run validate:revalidation` | PASS |
| Portfolio `bun run validate:blog-revalidation` | PASS |
| Active deployment/project/branch metadata | PASS, read-only |
| Production env key scope/update-time metadata | PASS, read-only; secret equality is UNVERIFIABLE |
| Production signed request | NOT RUN — outside authorization |
| Cron, replay, jobs, migrations, fixtures, R2 writes, deployments | NOT RUN — outside authorization |

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

1. If no configuration change is approved, authorize the narrowly scoped Gate H2
   recovery test described above. It is the smallest conclusive production
   delivery check and must re-inventory the queue before acting.
2. If Gate H2 returns `401` again, operator privately verifies/re-saves the
   exact original secret in both Production projects and confirms the CMS
   encrypted Config destination in the Vercel dashboard, then redeploys the
   affected project(s). Do not paste values into chat.
3. After a successful recovery, separately authorize a fresh fixture lifecycle
   retest (Gate H3) before certifying publish/move/unpublish/delete cache
   invalidation. Any direct authenticated Cron invocation remains a separate
   approval.

## Risks and boundaries

- Secret equality cannot be verified by presence-only checks. A successful signed delivery is the necessary end-to-end proof.
- Portfolio routes inherit a dynamic root layout and use tagged/stale-while-revalidate fetching. A first request after a valid invalidation is not proof of instant freshness; a follow-up bounded observation is required.
- The historical oversized-upload failure was not reproduced. This validation used one small allowed PNG only.
- No migrations, deployments, R2/provider configuration changes, administrator changes, signed manual webhook requests, Cron calls, or replay commands were made.

## Git

The only intended tracked change is this report. The pre-existing `.gitignore` modification remains unstaged and untouched. No push occurred.
