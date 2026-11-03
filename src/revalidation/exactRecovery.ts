import type { Payload } from 'payload'

import type { PayloadJob } from '../payload-types'
import { blogRevalidationQueue, blogRevalidationTaskSlug } from './contract'
import { revalidationJobBatchLimit } from './cron'
import { withRevalidationJobRunnerLock } from './runner'

export const exactRecoveryMaximumIDs = revalidationJobBatchLimit

export type ExactRecoveryCLIOptions = {
  allowProduction: boolean
  confirmIDs?: string
  execute: boolean
  ids: number[]
}

export type ExactRecoveryJob = {
  completedAt: string | null
  hasError: boolean
  id: number
  processing: boolean
  queue: string | null
  taskSlug: string | null
  totalTried: number | null
}

export type ExactRecoveryExecutedJob = ExactRecoveryJob & {
  runStatus: 'error' | 'error-reached-max-retries' | 'success' | 'unknown'
  terminalStatus: 'completed' | 'deleted-on-success'
}

export type ExactRecoveryRunResult =
  | { status: 'already-running' }
  | {
      jobs: ExactRecoveryExecutedJob[]
      status: 'completed'
    }

const invalidCLI = (message: string): never => {
  throw new Error(`Invalid exact-recovery command: ${message}`)
}

const parseJobID = (value: string): number => {
  if (!/^[1-9][0-9]*$/.test(value)) {
    invalidCLI(`job ID "${value}" must be a positive integer.`)
  }

  const id = Number(value)
  if (!Number.isSafeInteger(id)) {
    invalidCLI(`job ID "${value}" is outside the supported integer range.`)
  }

  return id
}

export const parseExactRecoveryCLIOptions = (argumentsList: string[]): ExactRecoveryCLIOptions => {
  const providedIDs: string[] = []
  let allowProduction = false
  let confirmIDs: string | undefined
  let execute = false

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index]

    if (argument === '--id') {
      const value = argumentsList[index + 1]
      if (!value || value.startsWith('--')) invalidCLI('--id must be followed by one positive integer.')
      providedIDs.push(value)
      index += 1
      continue
    }

    if (argument === '--execute') {
      execute = true
      continue
    }

    if (argument === '--confirm-ids') {
      const value = argumentsList[index + 1]
      if (!value || value.startsWith('--')) invalidCLI('--confirm-ids must be followed by the normalized ID list.')
      confirmIDs = value
      index += 1
      continue
    }

    if (argument === '--allow-production') {
      allowProduction = true
      continue
    }

    invalidCLI(`unsupported argument "${argument}".`)
  }

  if (providedIDs.length === 0) invalidCLI('at least one --id is required.')

  const ids = [...new Set(providedIDs.map(parseJobID))].sort((left, right) => left - right)
  if (ids.length > exactRecoveryMaximumIDs) {
    invalidCLI(`at most ${exactRecoveryMaximumIDs} distinct IDs may be selected.`)
  }

  if (execute && confirmIDs !== ids.join(',')) {
    invalidCLI(`--execute requires --confirm-ids ${ids.join(',')}.`)
  }

  if (!execute && confirmIDs) invalidCLI('--confirm-ids is only valid with --execute.')

  return { allowProduction, confirmIDs, execute, ids }
}

export const classifyDatabaseTarget = (environment: NodeJS.ProcessEnv): 'local' | 'production-like' | 'unknown' => {
  const databaseURL = environment.DATABASE_URL

  if (environment.VERCEL_ENV === 'production' || environment.NODE_ENV === 'production') return 'production-like'
  if (!databaseURL) return 'unknown'

  try {
    const { hostname } = new URL(databaseURL)
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return 'local'
    return 'production-like'
  } catch {
    return 'unknown'
  }
}

const toRecoveryJob = (job: PayloadJob, expectedID: number): ExactRecoveryJob => {
  const actualID = typeof job.id === 'number' ? job.id : Number(job.id)
  if (!Number.isSafeInteger(actualID) || actualID !== expectedID) {
    throw new Error(`Exact recovery refused job ${expectedID}: the returned record identity did not match.`)
  }

  return {
    completedAt: job.completedAt ?? null,
    hasError: job.hasError === true,
    id: actualID,
    processing: job.processing === true,
    queue: job.queue ?? null,
    taskSlug: job.taskSlug ?? null,
    totalTried: job.totalTried ?? null,
  }
}

const assertEligible = (job: ExactRecoveryJob): void => {
  if (job.queue !== blogRevalidationQueue || job.taskSlug !== blogRevalidationTaskSlug) {
    throw new Error(`Exact recovery refused job ${job.id}: it is not the expected revalidation queue and task.`)
  }

  if (job.completedAt || !job.hasError || job.processing) {
    throw new Error(`Exact recovery refused job ${job.id}: it is not an idle failed job.`)
  }
}

/** Reads only requested IDs and returns no task input, errors, signatures, or URLs. */
export const inspectExactRevalidationJobs = async (payload: Payload, ids: number[]): Promise<ExactRecoveryJob[]> => {
  const jobs: ExactRecoveryJob[] = []

  for (const id of ids) {
    let job: PayloadJob
    try {
      job = (await payload.findByID({
        collection: 'payload-jobs',
        depth: 0,
        id,
        overrideAccess: true,
      })) as PayloadJob
    } catch {
      throw new Error(`Exact recovery refused job ${id}: it was not found.`)
    }

    const recovered = toRecoveryJob(job, id)
    assertEligible(recovered)
    jobs.push(recovered)
  }

  return jobs
}

/**
 * Resets and runs only IDs that were explicitly selected and re-validated while
 * holding the shared runner lock. Payload receives one `where.id.equals`
 * predicate at a time with a limit of one, so no queue-wide query can be
 * substituted for the allowlist.
 */
export const recoverExactRevalidationJobs = async (payload: Payload, ids: number[]): Promise<ExactRecoveryRunResult> => {
  const lock = await withRevalidationJobRunnerLock(payload, async () => {
    const selected = await inspectExactRevalidationJobs(payload, ids)

    for (const job of selected) {
      await payload.update({
        collection: 'payload-jobs',
        data: {
          error: null,
          hasError: false,
          processing: false,
          waitUntil: null,
        },
        id: job.id,
        overrideAccess: true,
      })
    }

    const jobs: ExactRecoveryExecutedJob[] = []
    for (const job of selected) {
      const result = await payload.jobs.run({
        limit: 1,
        queue: blogRevalidationQueue,
        sequential: true,
        // The operator CLI reports only sanitized status metadata. Payload's
        // normal error logger includes task input, so keep task execution
        // silent here and preserve the durable error record for inspection.
        silent: true,
        where: {
          id: {
            equals: job.id,
          },
        },
      })
      const runStatus = result.jobStatus?.[String(job.id)]?.status ?? 'unknown'
      let observed: ExactRecoveryJob
      let terminalStatus: ExactRecoveryExecutedJob['terminalStatus']
      try {
        const after = (await payload.findByID({
          collection: 'payload-jobs',
          depth: 0,
          id: job.id,
          overrideAccess: true,
        })) as PayloadJob
        observed = toRecoveryJob(after, job.id)
        terminalStatus = 'completed'
      } catch {
        // Payload 3.89.0 deletes successful jobs by default. Treat a missing
        // record as a successful terminal state only when the exact runner
        // returned success; never infer success from absence alone.
        if (runStatus !== 'success') {
          throw new Error(`Exact recovery could not verify terminal state for job ${job.id}.`)
        }
        observed = { ...job, hasError: false, processing: false }
        terminalStatus = 'deleted-on-success'
      }
      jobs.push({
        ...observed,
        runStatus,
        terminalStatus,
      })
    }

    return jobs
  })

  if (lock.status === 'already-running') return lock
  return { jobs: lock.value, status: 'completed' }
}
