# Phase 8H4 — Exact-ID revalidation job recovery

Date: 2026-11-02
Repository: `lecav30/cms-portfolio` (`main`)
Scope: local implementation and validation only

## Decision

Added a safe operator CLI for inspecting and recovering an explicit, bounded
set of failed `blog-revalidation` Payload jobs. **Production recovery is NOT
AUTHORIZED and was NOT EXECUTED.** Production jobs `1` and `2` were not read,
reset, run, replayed, or otherwise changed by this task.

## Implementation

`bun run revalidate:recover -- --id <positive-id> [--id <positive-id> ...]`
is read-only by default. It deduplicates/sorts IDs, accepts at most ten, and
prints only non-secret job metadata: ID, queue, task slug, attempt count,
error/processing flags, and completion state.

Execution additionally requires:

```bash
--execute --confirm-ids <sorted-deduplicated-id-list>
```

For a production-like target (`NODE_ENV=production`, a Vercel Production
runtime, or a non-loopback database host), the command also requires
`--allow-production`; an unknown target is also refused by default. That is a
mechanical guard only; it does not replace the separate operator authorization
gate.

Before any reset, each selected ID is reread and must exactly match the
requested ID, queue `blog-revalidation`, task `blog-revalidation`, and an
idle, failed, non-completed state. The command holds the shared session-scoped
PostgreSQL advisory lock used by the request hook, CLI runner, and Vercel Cron
path. It resets each verified ID individually, then invokes Payload once per
ID with `queue=blog-revalidation`, `where.id.equals=<id>`, `limit=1`, and
sequential processing. No unrelated ready or errored job can match that
predicate.

Payload 3.89.0 defaults `deleteJobOnComplete` to true. A successful delivery
therefore has one of two expected terminal observations: a retained completed
record or `deleted-on-success`. The command never deletes audit rows itself.
It keeps task execution silent because Payload's standard error logger can
include job input; the CLI emits only sanitized result metadata.

## Local validation

Target: the existing loopback PostgreSQL development environment. The test
created only disposable `payload-jobs` records and a loopback HTTP receiver;
all fixture records were removed in `finally`. No production provider,
database, R2 object, cron route, deployment, migration, or portfolio file was
contacted or changed.

| Check | Result | Evidence |
| --- | --- | --- |
| `bun run typecheck` | PASS | New CLI, shared lock helper, and validation script compile. |
| `bun run validate:exact-recovery` | PASS | Real local PostgreSQL jobs and loopback HMAC receiver. |
| Read-only inspect | PASS | Normalizes duplicate selected IDs and produces zero deliveries. |
| Invalid/missing selection | PASS | Missing, zero, execution-without-confirmation, mixed-queue, wrong-task, nonfailed, and completed selections are rejected. |
| Shared lock contention | PASS | A held advisory lock returns the CLI's already-running result; zero jobs run. |
| Exact delivery | PASS | Two selected failed jobs produced exactly two valid signed loopback deliveries. |
| Unrelated ready job | PASS | A ready job in the same queue remained unprocessed. |
| Repeat execution | PASS | Completed/deleted selected IDs were refused and produced no additional delivery. |
| Transient receiver failure | PASS | A selected 503 delivery exits nonzero and is not reported as successful. |

The focused local test uses fresh in-memory webhook secrets and never prints
their values. It proves ID isolation and the real Payload delivery path, not a
production recovery.

## Project regression checks

| Command | Result | Boundary |
| --- | --- | --- |
| `bun install --frozen-lockfile` | PASS | Existing lockfile; no dependency changes. |
| `bun run typecheck` | PASS | Includes the new CLI and local validation script. |
| `bun run lint` | PASS | No new lint findings. |
| `bun run validate:revalidation` | PASS | Sender contract regression only. |
| `bun run validate:cron-runner` | PASS | Shared-lock/cron unit regression only. |
| `bun run validate:r2-config` | PASS | Static R2 configuration regression only. |
| `bun run build` | PASS | Local build with existing private configuration; it does not contact production. |
| `git diff --check` | PASS | Checked before commit. |

## Production recovery gate

Before any production use, perform a read-only preflight to reconfirm that
jobs `1` and `2` are the only selected fixture jobs, still failed and idle, and
that the original fixture remains absent. Then obtain this separate approval:

> I authorize Gate H3 to recover only production `blog-revalidation` jobs 1
> and 2 associated with the deleted Phase 8H fixture, using
> `revalidate:recover` with an exact-ID-scoped mechanism, with no cron
> invocation, other jobs, content writes, migrations, or deployments.

Only then may an operator use the exact approved IDs with `--execute`, the
matching `--confirm-ids`, and the production guard. Observe the sender's
receiver response and terminal job state, then verify the already-deleted
fixture URL remains `404`. Do not substitute `revalidate:replay` or a cron
call: both are queue-scoped mechanisms.

## Files changed

- `src/revalidation/runner.ts` — reusable shared advisory-lock helper.
- `src/revalidation/exactRecovery.ts` — parser, target classification,
  strict inspection, and exact-ID recovery implementation.
- `scripts/recover-revalidation-jobs.ts` — operator CLI.
- `scripts/validate-exact-revalidation-recovery.ts` — disposable local
  PostgreSQL/loopback regression validation.
- `package.json` and `README.md` — command wiring and operator runbook.

No migration was added. No push occurred. The pre-existing unstaged
`.gitignore` change is outside this task and remains untouched.
