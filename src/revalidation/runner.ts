import type { Payload } from 'payload'

import { blogRevalidationQueue, blogRevalidationTaskSlug } from './contract'
import { revalidationJobBatchLimit } from './cron'

// A transaction-scoped PostgreSQL advisory lock would be released before the
// job handler runs. This session lock intentionally spans the bounded runner
// invocation and is shared by the request hook, CLI scripts, and cron route.
export const revalidationJobRunnerAdvisoryLockKey = 1_427_598_331

export type RevalidationJobLockResult<T> =
  | { status: 'already-running' }
  | { status: 'completed'; value: T }

/**
 * Serializes every revalidation-job runner entry point with the same
 * session-scoped PostgreSQL advisory lock. A session lock is intentional: a
 * transaction lock would be released before a task handler performs delivery.
 */
export const withRevalidationJobRunnerLock = async <T>(
  payload: Payload,
  callback: () => Promise<T>,
): Promise<RevalidationJobLockResult<T>> => {
  const client = await payload.db.pool.connect()
  let locked = false

  try {
    const lock = await client.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock($1) AS acquired', [revalidationJobRunnerAdvisoryLockKey])
    locked = lock.rows[0]?.acquired === true

    if (!locked) return { status: 'already-running' }

    return { status: 'completed', value: await callback() }
  } finally {
    try {
      if (locked) {
        await client.query('SELECT pg_advisory_unlock($1)', [revalidationJobRunnerAdvisoryLockKey])
      }
    } finally {
      client.release()
    }
  }
}

export type RevalidationJobRunResult =
  | { status: 'already-running' }
  | {
      noJobsRemaining: boolean
      remainingJobsFromQueried: number
      status: 'completed'
    }

export const runQueuedRevalidationJobs = async (payload: Payload): Promise<RevalidationJobRunResult> => {
  const lock = await withRevalidationJobRunnerLock(payload, async () => {
    const result = await payload.jobs.run({
      limit: revalidationJobBatchLimit,
      queue: blogRevalidationQueue,
      sequential: true,
      silent: { error: false, info: true },
      where: {
        taskSlug: {
          equals: blogRevalidationTaskSlug,
        },
      },
    })

    return {
      noJobsRemaining: result.noJobsRemaining === true,
      remainingJobsFromQueried: result.remainingJobsFromQueried,
    }
  })

  if (lock.status === 'already-running') {
    return lock
  }

  return {
    ...lock.value,
    status: 'completed',
  }
}
