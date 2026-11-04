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

## Gate H2 — one authorized scoped recovery attempt

The operator authorized one recovery attempt with the explicit boundary that a
fresh inventory must contain only fixture jobs `1` and `2`, with no fixture
creation, Cron-route invocation, environment change, or deployment.

### Guard and execution

The immediate preflight returned exactly the expected queue inventory:

| Job ID | Operation | Pending | Error flag before run | Attempts before run |
| ---: | --- | --- | --- | ---: |
| 1 | `publish` | Yes | Yes | 3 |
| 2 | `delete` | Yes | Yes | 3 |

The existing queue-scoped recovery command was run once against that isolated
queue using the Production CMS configuration. It reported that it reset two
failed revalidation jobs and invoked the bounded runner once. The Cron route
was not called.

### Observed delivery outcome

| Job ID | Operation | Exact receiver HTTP result | Final result of this attempt |
| ---: | --- | ---: | --- |
| 1 | `publish` | `401` | Failed; bounded task recorded a non-retryable receiver rejection. |
| 2 | `delete` | `401` | Failed; bounded task recorded a non-retryable receiver rejection. |

The recovery command completed its two-job pass, but **neither delivery
succeeded**. Both jobs reached attempt `4` and remained in an error state. No
secret, signature, request body, token, or raw job payload is included here.

Per the Gate H2 stop condition, no additional delivery attempt, public-path
probe, Cron call, replay, signed request, fixture operation, migration, R2
operation, deployment, or environment edit was performed after either `401`
was observed.

### Required concrete corrective action

The repeated application-level `401` makes the active sender/receiver
authentication configuration the remaining blocker. Before another recovery
attempt, the operator must use a private source of truth (for example a
password manager) to perform this Vercel Production-only correction:

1. In **portfolio**, set `BLOG_REVALIDATION_SECRET` to the intended exact
   shared bytes and create a new Production deployment.
2. In **cms-portfolio**, set `BLOG_REVALIDATION_SECRET` to the exact same
   bytes; re-save `PORTFOLIO_REVALIDATION_URL` as exactly
   `https://www.sebastianlevano.com/api/internal/revalidate`; then create a new
   Production deployment.
3. Confirm both deployments are Ready and were created after the variable
   updates. Do not disclose values in chat or source control.

This need not rotate the secret if the original intended value is available:
re-saving the exact known value in both projects removes uncertainty about
entry/whitespace and deployment activation. If it is not available, generate a
new shared value of at least 32 bytes and treat that as a deliberate rotation.

After the correction, a new explicit authorization is required before any
replay. It must again first prove that only jobs `1` and `2` are in the
`blog-revalidation` queue. A successful recovery requires receiver `204` for
both jobs, completed queue records, and a separate authorized verification of
the deleted fixture's public absence.

## Post-correction controlled signed-authentication test

After the operator re-saved the shared Production secret and confirmed the CMS
destination, Vercel reported these new Ready Production deployments:

| Project | Deployment | Created | Source commit |
| --- | --- | --- | --- |
| CMS | `dpl_JEUnHsEHvijxt3XcDsoZbwZ3xiMs` | `2026-11-03T02:46:41Z` | `6d5765d5837283753def1c878cde58e9e249f7de` |
| Portfolio | `dpl_7jEMDt79hvHHxeeg3WDLiRnfcuMX` | `2026-11-03T02:46:53Z` | `92b9c5987798b1ad4bc96cdd2ebc5ee346cb7b6f` |

One explicitly authorized, non-editorial signed request was then sent through
the existing CMS `deliverBlogRevalidation` sender. It used a fresh UUIDv4 event
ID and timestamp plus a collision-resistant nonexistent slug/category and a
synthetic safe numeric post ID. It created no CMS record, R2 object, job,
administrator, or public content. The sender emitted no secret, HMAC header,
signature, or event ID to output.

| Check | Exact result |
| --- | --- |
| Portfolio receiver HTTP response | **`204 No Content`** |
| Signed receiver authentication | **PASS** |
| Queued jobs `1` / `2` | **NOT EXECUTED** by this test |
| Cron, replay, migrations, environment edits, editorial writes | **NOT RUN** |

This establishes that the current Production portfolio receiver accepts a
correctly signed request made with the existing CMS sender contract and the
private production sender configuration used for this test. It does not by
itself complete the previously failed durable CMS jobs or prove delivery from a
deployed CMS job runner; those require their own separate authorization and
fresh queue preflight.

## Prompt 31 Gate H3 — scoped recovery preflight (read-only)

### Target identity and fixture absence

Both current Production deployments remain Ready:

| Project | Deployment | State |
| --- | --- | --- |
| CMS | `dpl_JEUnHsEHvijxt3XcDsoZbwZ3xiMs` | Ready |
| Portfolio | `dpl_7jEMDt79hvHHxeeg3WDLiRnfcuMX` | Ready |

The production queue preflight found exactly two `blog-revalidation` jobs and
no other queue entries. Both are eligible Phase 8H fixture jobs:

| Job ID | Queue / task | Operation | Pending | Error | Attempts |
| ---: | --- | --- | --- | --- | ---: |
| 1 | `blog-revalidation` / `blog-revalidation` | `publish` | Yes | Yes | 4 |
| 2 | `blog-revalidation` / `blog-revalidation` | `delete` | Yes | Yes | 4 |

The job metadata has the expected Phase 8H shape: the publish event has only a
current public location; the delete event has only a previous public location;
both reference the same fixture Post ID. The raw slugs, event IDs, and payloads
are intentionally not reproduced here.

Read-only database counts are zero for Posts, Categories, Tags, and Media. The
prior exact R2 object-head cleanup check returned `404`, and no production
fixture write has occurred since. A read-only request to the old public
portfolio fixture path returned `404`.

### Exact-ID replay assessment

The existing `scripts/replay-revalidation-jobs.ts` is **not** exact-ID scoped:
it resets every failed job in `blog-revalidation`, then calls the standard
runner, whose filter is task/queue scoped with a limit of ten. It must not be
used for this Gate H3, even though this preflight currently sees only jobs `1`
and `2`; a bounded limit is not an identity guarantee.

Payload `3.89.0` does support an exact `id` argument on its underlying
`RunJobsArgs`, but the repository has no current command that combines that
exact run with an exact-ID-only reset of failed state. Therefore no production
replay was performed in this phase.

The minimal safe remediation is a dedicated local recovery command that:

1. accepts a validated, non-empty explicit ID list;
2. re-reads the selected records and rejects any ID not in
   `blog-revalidation`, not in the expected task, not errored, or not exactly
   the requested set;
3. resets only those IDs in one constrained update; and
4. invokes the Payload job runner once per verified ID using its exact `id`
   selector while retaining the existing advisory lock and sequential behavior.

That code requires focused tests and a review before it is used against
Production. It must not be substituted with a direct Cron call or the existing
blanket replay script.

### Gate H3 status and required authorization

**READY FOR AUTHORIZATION, NOT EXECUTED.** No job state, queued work, Cron,
replay, fixture, R2 object, migration, environment variable, or deployment was
changed by this preflight.

After an exact-ID mechanism has been implemented and validated, the required
authorization is:

> I authorize Gate H3 to replay only production `blog-revalidation` jobs 1 and
> 2 associated with the deleted Phase 8H fixture, using a verified
> exact-ID-scoped mechanism, with no cron invocation, other jobs, content
> writes, or deployments.

Successful recovery must observe `204` for each delivery, terminal delivered
state for both records, and the old public fixture path remaining `404`. A
fresh publish/update/move/unpublish/delete lifecycle remains a separate
production authorization after this recovery is complete.

### Gate H3 local validation

| Command | Result |
| --- | --- |
| `bun run validate:revalidation` | PASS |
| `bun run validate:cron-runner` | PASS |
| Production job/fixture/deployment preflight | PASS, read-only |

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

## Prompt 33 — Phase 8H5 exact-ID recovery preflight (2026-11-03)

### Decision

**GATE H3 NO-GO — production target identity and job state are not yet
independently verified. No authorization request is made.**

The checkout is at `d23d73f feat(cms): add safe exact-id revalidation job
recovery`, which contains the reviewed H4 `revalidate:recover` implementation.
Its default invocation is read-only and its execution mode requires exact IDs,
matching `--confirm-ids`, the shared advisory lock, and a production guard.
The unrelated unstaged `.gitignore` edit was present before this preflight and
was not modified or staged.

### Read-only observations

| Item | Result | Evidence / boundary |
| --- | --- | --- |
| Linked CMS Vercel project | PASS | `cms-portfolio`; Next.js, Node `24.x`, root `.`, region `iad1`. |
| Production CMS environment names | PASS, names/scopes only | `DATABASE_URL`, `PAYLOAD_SECRET`, `NEXT_PUBLIC_SERVER_URL`, `CORS_ORIGINS`, all required `R2_*`, `PORTFOLIO_REVALIDATION_URL`, `BLOG_REVALIDATION_SECRET`, and `CRON_SECRET` are listed for Production. Values were not read. |
| Public HTTPS smoke | PASS | `HEAD /admin` returned `200` with `X-Robots-Tag: noindex, nofollow, noarchive`; public portfolio `/blog` returned `200`. |
| Active deployment SHA/state | UNVERIFIED | The authenticated CLI deployment listing did not return an unambiguous project-scoped Production result in this session. Public Vercel headers alone do not prove the deployed source SHA. |
| Neon identity / migration state | BLOCKED | No direct production connection was established. |
| Jobs `1` and `2` / queue inventory | BLOCKED | No production job query was executed. |

### Environment-access blocker

`vercel env run --environment production` intentionally did not export two
Production Secret values to the local process. It then loaded the already
ignored local environment files. The resulting safe identity query reported
the local Homebrew development database (`cms_portfolio_dev`), not Neon, and a
read-only CLI inspection therefore found no local job `1`. This proves only
that the attempted process was **not** pointed at Production; it did not read
or change Production Neon, R2, jobs, Cron, deployments, or webhook state.

The command was stopped at that point. No queue-wide replay, exact recovery,
Cron invocation, migration, deployment, fixture creation, or provider edit was
performed.

### Required operator action before recovery can be considered

Provide a separately controlled, read-only way to run the existing CLI against
the verified direct Neon Production target without exporting any secret to chat
or a tracked file. Suitable options are an operator-run private terminal with
the full CMS Production runtime configuration already available, or a
read-only Neon SQL/connection workflow that confirms:

1. direct Neon target identity and the three applied migrations;
2. exactly two eligible `blog-revalidation` jobs, IDs `1` and `2`, both with
   task slug `blog-revalidation`, failed/idle state, and four attempts;
3. no other runnable or failed `blog-revalidation` jobs; and
4. no Posts, Categories, Tags, or Media fixtures remaining.

Once that evidence is available, rerun the H5 read-only preflight. Only if it
passes should the following separate authorization be requested:

> I authorize Gate H3 to recover only production `blog-revalidation` jobs 1
> and 2 associated with the deleted Phase 8H fixture, using
> `revalidate:recover` with an exact-ID-scoped mechanism, with no cron
> invocation, other jobs, content writes, migrations, or deployments.

The prospective execution command, shown here but **not run**, is:

```bash
bun run revalidate:recover -- --id 1 --id 2 --execute --confirm-ids 1,2 --allow-production
```

It is valid only from the verified Production runtime context after the fresh
preflight and explicit authorization. The command is not a substitute for the
target check or the approval gate.

## Prompt 34 — Phase 8H6 private Production Neon read-only preflight (2026-11-03)

### Credential source and read-only boundary

The operator provided an external private credential file at a restricted
home-directory path. Its permissions were verified as `0600`; it was neither
copied into this repository nor printed. The preflight parsed only the named
`CMS_PRODUCTION_DATABASE_URL` assignment without shell evaluation and did not
read the ordinary `DATABASE_URL` name, any `.env`/`.env.local` file, a Vercel
environment export, or a Payload startup path. This prevents the local
`cms_portfolio_dev` fallback observed in H5.

One direct `pg` client transaction used `BEGIN READ ONLY`, a five-second local
statement timeout, narrowly scoped `SELECT` statements, and `ROLLBACK`. No
application mutation API, job runner, Cron route, migration, or webhook was
called. The temporary credential-free reader script was removed after the
query; the operator-owned credential file remains untouched.

### Production target and schema evidence

| Item | Result |
| --- | --- |
| Provider / endpoint | PASS — Neon direct endpoint (not a `-pooler` host) |
| Database / engine | PASS — `neondb`, PostgreSQL `18.6` |
| Migration records | PASS — `20261029_025459_phase_02_editorial_collections`, `20261029_032843_phase_03_r2_media_prefix`, and `20261029_202955_phase_05_blog_revalidation_jobs` |
| User count | PASS — exactly one; no user identity or password data selected |
| Posts / Categories / Tags / Media counts | PASS — all zero |

### Revalidation queue inventory

The complete `blog-revalidation` queue contains exactly two rows and no
unrelated ready, failed, completed, or differently tasked entries:

| Job | Task / queue | Operation | Error / processing / completed | Attempts | Fixture linkage |
| ---: | --- | --- | --- | ---: | --- |
| 1 | `blog-revalidation` / `blog-revalidation` | `publish` | errored / idle / not completed | 4 | current-location shape |
| 2 | `blog-revalidation` / `blog-revalidation` | `delete` | errored / idle / not completed | 4 | previous-location shape |

Both rows reference the same non-public Post identifier. No raw slugs, event
IDs, task input, credentials, or signature material was recorded. This matches
the cleaned Phase 8H fixture lifecycle and satisfies the exact recovery CLI's
queue, task, failed-state, processing, and completion preconditions.

### CLI safeguards and decision

The checked-out H4 command remains at `d23d73f`; its execution parser was
reconfirmed locally to reject `--execute` without the matching
`--confirm-ids` before any Payload/database operation. Previous H4 integration
validation covers its exact-ID predicate, advisory-lock contention, unrelated
job isolation, signed local delivery, repeat refusal, and partial failure.

**GATE H3 READY — AWAITING EXPLICIT AUTHORIZATION.** Production remains
read-only in this phase. Do not run a queue-wide replay or Cron endpoint. In a
subsequent, separately authorized turn, first repeat the same direct-Neon
read-only identity/inventory check, then run only this command within the
verified private Production runtime (where `DATABASE_URL` is supplied from the
external private credential source, never a repository `.env` file):

```bash
bun run revalidate:recover -- --id 1 --id 2 --execute --confirm-ids 1,2 --allow-production
```

Required authorization wording:

> I authorize exact-ID recovery of only production `blog-revalidation` jobs 1
> and 2 after reconfirming their identifiers and state; no unrelated jobs,
> Cron endpoint, migrations, or editorial writes.

After authorization, record only sanitized per-ID result status, receiver HTTP
status, terminal/deleted-on-success state, unchanged queue isolation, and the
public absence of the already-deleted fixture. Do not retry automatically if a
delivery is not `204`.

### Post-authorization runtime configuration gate (2026-11-03)

The operator authorized the exact recovery and the direct-Neon read-only
preflight was immediately repeated. It again found only jobs `1` and `2` in
the expected failed, idle states, linked to the same cleaned fixture. No job
state changed.

Execution was then stopped **before** starting Payload because the external
private file currently contains only `CMS_PRODUCTION_DATABASE_URL`. A safe
Payload production runtime must not fall back to local webhook credentials,
media configuration, or development mode (which could enable development
schema synchronization). The recovery task needs the real server-only
Production settings in the same restricted external source before it can send
the receiver-compatible signed event.

The operator must privately add the following names, with the existing
`CMS_PRODUCTION_` prefix, to that `0600` file and then confirm readiness
without sharing values:

- `CMS_PRODUCTION_PAYLOAD_SECRET`
- `CMS_PRODUCTION_BLOG_REVALIDATION_SECRET`
- `CMS_PRODUCTION_PORTFOLIO_REVALIDATION_URL`
- `CMS_PRODUCTION_R2_ENABLED`
- `CMS_PRODUCTION_R2_BUCKET`
- `CMS_PRODUCTION_R2_ENDPOINT`
- `CMS_PRODUCTION_R2_ACCESS_KEY_ID`
- `CMS_PRODUCTION_R2_SECRET_ACCESS_KEY`
- `CMS_PRODUCTION_R2_PUBLIC_BASE_URL`

The execution wrapper will map only those private values into the child
process's expected server-only names, set `NODE_ENV=production`, and never
print them or read repository `.env` files. It will not include
`INITIAL_ADMIN_*`, invoke Cron, apply migrations, or use any queue-wide replay.
After the runtime source is complete, repeat the direct-Neon read-only
preflight once more immediately before the single authorized exact-ID command.

## Prompt 34 follow-up — authorized exact-ID recovery (2026-11-03)

### Authorization and immediately preceding recheck

The operator explicitly authorized recovery of only Production
`blog-revalidation` jobs `1` and `2`, with no Cron endpoint, migrations,
editorial writes, or unrelated jobs. Before execution, the restricted external
runtime source was checked for the required `CMS_PRODUCTION_*` names only; no
value was printed or copied into this repository. A fresh direct-Neon,
read-only query then reconfirmed all of the following:

- target: direct Neon Production database `neondb`, PostgreSQL `18.6`;
- the same three reviewed migration records listed in the H6 section;
- one User and zero Posts, Categories, Tags, and Media records; and
- exactly two `blog-revalidation` rows: `1` (`publish`) and `2` (`delete`),
  both idle, errored, incomplete, at four attempts, and using the expected
  queue/task. No other queue row was present.

This removed the earlier runtime-configuration gate; the prior gate text is
retained above as historical context only.

### Scoped execution and observed result

The recovery ran once with the existing exact-ID command shape:

```bash
bun run revalidate:recover -- --id 1 --id 2 --execute --confirm-ids 1,2 --allow-production
```

It was started only through a temporary wrapper which supplied the private
runtime values to the child process, forced `NODE_ENV=production`, disabled
`INITIAL_ADMIN_*`, and performed a final pre-run queue identity check. The
command acquired the shared PostgreSQL advisory lock, revalidated each ID, and
used one `where.id.equals` / `limit: 1` Payload job run per selected ID. It did
not call Cron or a queue-wide replay.

| Check | Result | Evidence |
| --- | --- | --- |
| Job `1` | PASS | Runner reported `success`; terminal state `deleted-on-success`. |
| Job `2` | PASS | Runner reported `success`; terminal state `deleted-on-success`. |
| Signed receiver response | PASS — HTTP `204` | The task returns `success` only when the portfolio receiver response is exactly `204`; raw signed request details were intentionally not logged. |
| Queue isolation | PASS | Post-run query found no remaining `blog-revalidation` rows. The pre-run inventory contained only IDs `1` and `2`. |
| Deleted fixture public route | PASS | Bounded public request returned HTTP `404`. The fixture slug was kept private. |
| Unrelated production resources | PASS | No Cron invocation, migration, deployment, administrator/content/media/R2 write, or environment change was performed. |

Payload deletes successfully completed jobs under the configured policy, so
`deleted-on-success` is the expected terminal condition, not a missing audit
record. No automatic retry was made.

### Resulting status

**Gate H3 complete.** The two historic fixture-only failures were recovered
through the exact-ID mechanism after the signed receiver was repaired. A new
full production editorial lifecycle remains a separate, explicitly authorized
test; it was not recreated here because the Phase 8H fixtures had already been
removed.

## Prompt 35 — Phase 8H7 final editorial lifecycle preflight (2026-11-03)

### Read-only deployment and configuration evidence

This preflight made no Production writes. It used the external `0600` runtime
source only for a direct Neon `BEGIN READ ONLY` transaction; the source was not
printed, copied into the repository, or evaluated by a shell. The temporary
reader required the explicit `CMS_PRODUCTION_DATABASE_URL` name and rejected
local or Neon pooler endpoints, preventing a local-development fallback.

| Component | Result | Evidence |
| --- | --- | --- |
| CMS Vercel project | PASS | `cms-portfolio` under `own-projects` (`sebastianlevano` scope); Next.js, Node `24.x`, root `.`, region `iad1`. |
| CMS active Production deployment | PASS | Ready; production `main` commit `6d5765d5837283753def1c878cde58e9e249f7de`. Local documentation commits after that SHA are not deployed and do not change CMS runtime behavior. |
| Portfolio Vercel project | PASS | `portfolio` under the same scope; Next.js and Node `24.x`. |
| Portfolio active Production deployment | PASS | Ready; production `main` commit `92b9c5987798b1ad4bc96cdd2ebc5ee346cb7b6f`. The portfolio repository was not modified. |
| CMS Production variable names/scopes | PASS, names only | `DATABASE_URL`, `PAYLOAD_SECRET`, `BLOG_REVALIDATION_SECRET`, `CRON_SECRET`, `PORTFOLIO_REVALIDATION_URL`, `NEXT_PUBLIC_SERVER_URL`, `CORS_ORIGINS`, and all required `R2_*` names are Production-scoped. |
| Portfolio Production variable names/scopes | PASS, names only | `PAYLOAD_CMS_URL` and `BLOG_REVALIDATION_SECRET` are Production-scoped. Values and equality were not read. |

### Neon baseline and queue state

| Check | Result |
| --- | --- |
| Target identity | PASS — direct Neon Production endpoint, database `neondb`, PostgreSQL `18.6`. |
| Migration chain | PASS — `20261029_025459_phase_02_editorial_collections`, `20261029_032843_phase_03_r2_media_prefix`, and `20261029_202955_phase_05_blog_revalidation_jobs`. |
| User count | PASS — one, queried as a count only. |
| Posts / published Posts / Categories / Tags / Media | PASS — all zero. |
| `blog-revalidation` queue | PASS — empty. |

### Public boundary checks

| Request | Observed status | Result |
| --- | ---: | --- |
| CMS `HEAD /admin` | `200` | PASS — reachability only. |
| CMS public `GET /api/posts?limit=1` | `200` | PASS — published-read endpoint reachable. |
| CMS anonymous `GET /api/users` | `403` | PASS — user records remain protected. |
| CMS anonymous `POST /api/posts` with an empty JSON body | `403` | PASS — rejected; no record was created. |
| Portfolio `GET /blog` | `200` | PASS — public listing reachable. |

### Gate H7 write plan and boundaries

The next stage needs new, bounded Production data; it is **not authorized by
this preflight**. If approved, it will create and remove only these
uniquely-prefixed text-only fixtures:

1. two Categories (the second is needed solely to verify a category move);
2. one optional Tag only if the real authoring request requires it (otherwise
   no Tag); and
3. one Post, created as a draft and then transitioned through publish, public
   edit, slug/category move, unpublish, republish, and delete.

No Media or R2 object will be created. Each post-response transition will be
observed through the normal Payload `after()` scheduler and its durable
`blog-revalidation` job only. The test will not invoke Cron, queue-wide replay,
or an exact-ID recovery command. If the normal response path leaves any job
pending or errored, new writes will stop, the exact job IDs/statuses will be
reported, and a separate authorization will be requested before any manual
runner action.

For each transition, bounded public CMS REST and portfolio HTTP checks will
assert the current/previous detail path, category listing, draft isolation,
and visible title state. The portfolio's tagged stale-while-revalidate behavior
will be allowed a finite polling window; an initial stale response will not be
treated as either success or failure. Cleanup will use the exact saved fixture
IDs only, then recheck the baseline counts, queue state, and all former public
fixture URLs (`404`). No broad deletion, migration, deployment, environment
edit, user operation, R2 write, Cron call, or portfolio change is in scope.

**GATE H7-WRITE READY — AWAITING EXPLICIT AUTHORIZATION.**

> I authorize Gate H7-WRITE to create, lifecycle-test, and remove only one
> uniquely prefixed text-only Production Post and its two uniquely prefixed
> Categories (plus one Tag only if required), using normal post-response job
> handling; no Media/R2 writes, Cron, replay, migrations, deployments,
> environment changes, or unrelated content/user operations.

## Prompt 35 — Phase 8H7 authorized Production editorial lifecycle (2026-11-03)

### Authorization and fixture boundary

The operator explicitly authorized Gate H7-WRITE. The harness repeated the
direct-Neon, read-only baseline check before login, then used the existing
administrator only to create and mutate a unique `phase-08h7-*` text fixture.
The private `0600` manifest recorded only exact resource IDs and slugs, never
credentials or session material. No Tag, Media, or R2 object was needed.

Fixture scope:

- two temporary Categories, required solely to exercise a category move;
- one temporary Post; and
- no changes to the existing User, application configuration, deployments,
  migrations, Cron route, queue-wide runner, or portfolio repository.

The authenticated Payload login returned `200` inside the private harness; its
JWT was retained only in memory and discarded before process exit.

### Observed lifecycle

Each mutation used the normal authenticated CMS REST API. Each public check
used the deployed anonymous CMS REST route or the public portfolio HTTP route.
The harness polled for at most 75 seconds per state; the complete lifecycle
and cleanup finished in roughly 29 seconds.

| Transition | CMS public result | Portfolio result | Durable-job observation |
| --- | --- | --- | --- |
| Create draft | direct detail `404` | detail `404` | queue remained empty; no public event was emitted. |
| Publish | detail `200` | listing, detail, and Category A page `200`, each containing the fixture title | queue empty after the response-driven work. |
| Published title/content update | detail `200` | listing, detail, and Category A page reflected the updated title | queue empty after the response-driven work. |
| Move slug and category | new detail `200` | new detail and Category B contained the fixture; old detail `404`; Category A no longer contained it | queue empty after the response-driven work. |
| Unpublish | detail `404` | detail `404`; listing and Category B excluded the title | queue empty after the response-driven work. |
| Republish | detail `200` | listing, detail, and Category B again contained the title | queue empty after the response-driven work. |
| Exact delete / cleanup | detail `404` | final current detail `404` | queue empty after the response-driven delete work. |

The `blog-revalidation` task only returns a successful job result after the
portfolio receiver returns HTTP `204`. Every public-content transition above
reached its new portfolio state inside the bounded window and left no retained
or errored queue row. This is strong task-contract-backed evidence of signed
`204` delivery for the normal response path; the harness intentionally did not
log signed request material or raw response objects.

A filtered Vercel runtime-log query did not independently return the expected
success log message. A broader one-hour query was rejected by Hobby-plan log
retention. This is an observability limitation, not a failure of the lifecycle
assertions; it should be addressed with production log/queue monitoring before
relying on logs for incident response.

### Cleanup and final state

The exact Post deletion was completed before the two exact Category deletions.
The private manifest was removed only after the final direct-Neon read-only
check confirmed the original baseline:

| Resource | Final count |
| --- | ---: |
| Users | 1 |
| Posts / Categories / Tags / Media | 0 / 0 / 0 / 0 |
| `blog-revalidation` jobs | 0 |

The former current public fixture route returned `404`; the earlier old-slug
route had already returned `404` after the move and was never recreated. No
manifest, token, temporary fixture, job, or R2 object remains.

### Phase 8H7 verdict

**PASS — controlled Production editorial publication lifecycle and exact
cleanup.** Draft isolation, publish, public update, slug/category move,
unpublish, republish, delete, published-only CMS REST behavior, and public
portfolio state were observed against the deployed applications. The
authenticated scheduled Cron route remains **NOT LIVE-TESTED** by design: no
Cron request, replay, or queue-wide processing was authorized or used.

## Risks and boundaries

- Secret equality cannot be verified by presence-only checks. A successful signed delivery is the necessary end-to-end proof.
- Portfolio routes inherit a dynamic root layout and use tagged/stale-while-revalidate fetching. A first request after a valid invalidation is not proof of instant freshness; a follow-up bounded observation is required.
- The historical oversized-upload failure was not reproduced. This validation used one small allowed PNG only.
- No migrations, deployments, R2/provider configuration changes, administrator changes, signed manual webhook requests, or Cron calls were made. The only Production write in this follow-up was the explicitly authorized exact-ID recovery of jobs `1` and `2` documented above.

## Git

The only intended tracked change is this report. The pre-existing `.gitignore` modification remains unstaged and untouched. No push occurred.
