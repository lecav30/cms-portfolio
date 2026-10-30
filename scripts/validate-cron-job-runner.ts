import { isAuthorizedCronRequest, resolveCronSecret } from '../src/revalidation/cron'
import { runQueuedRevalidationJobs } from '../src/revalidation/runner'
import { blogRevalidationQueue, blogRevalidationTaskSlug } from '../src/revalidation/contract'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const secret = '0123456789abcdef0123456789abcdef'

assert(resolveCronSecret({}) === undefined, 'An absent CRON_SECRET was accepted.')
assert(resolveCronSecret({ CRON_SECRET: 'too-short' }) === undefined, 'A weak CRON_SECRET was accepted.')
assert(resolveCronSecret({ CRON_SECRET: ` ${secret}` }) === undefined, 'A whitespace-padded CRON_SECRET was accepted.')
assert(resolveCronSecret({ CRON_SECRET: secret }) === secret, 'A valid CRON_SECRET was rejected.')
assert(!isAuthorizedCronRequest(null, secret), 'Missing Authorization was accepted.')
assert(!isAuthorizedCronRequest('Basic token', secret), 'A malformed Authorization value was accepted.')
assert(!isAuthorizedCronRequest(`Bearer ${secret}extra`, secret), 'An incorrect bearer token was accepted.')
assert(isAuthorizedCronRequest(`Bearer ${secret}`, secret), 'The exact bearer token was rejected.')

type Query = (text: string, values?: unknown[]) => Promise<{ rows: Array<{ acquired: boolean }> }>

const calls: Array<{ text: string; values?: unknown[] }> = []
let runArguments: Record<string, unknown> | undefined
let released = false

const client = {
  query: (async (text: string, values?: unknown[]) => {
    calls.push({ text, values })
    return { rows: [{ acquired: true }] }
  }) as Query,
  release: () => {
    released = true
  },
}

const payload = {
  db: { pool: { connect: async () => client } },
  jobs: {
    run: async (args: Record<string, unknown>) => {
      runArguments = args
      return { noJobsRemaining: false, remainingJobsFromQueried: 2 }
    },
  },
}

const result = await runQueuedRevalidationJobs(payload as never)
assert(result.status === 'completed', 'The acquired runner did not complete.')
assert(runArguments?.queue === blogRevalidationQueue, 'The runner did not constrain the queue.')
assert(runArguments?.limit === 10 && runArguments?.sequential === true, 'The runner lost its bounded sequential settings.')
assert(
  (runArguments?.where as { taskSlug?: { equals?: string } } | undefined)?.taskSlug?.equals === blogRevalidationTaskSlug,
  'The runner did not constrain the task slug.',
)
assert(calls.length === 2 && calls[1]?.text.includes('pg_advisory_unlock'), 'The successful runner did not release its advisory lock.')
assert(released, 'The successful runner did not release its database client.')

let lockedRunCount = 0
const lockedPayload = {
  db: {
    pool: {
      connect: async () => ({
        query: async () => ({ rows: [{ acquired: false }] }),
        release: () => undefined,
      }),
    },
  },
  jobs: { run: async () => ++lockedRunCount },
}
const lockedResult = await runQueuedRevalidationJobs(lockedPayload as never)
assert(lockedResult.status === 'already-running', 'A busy advisory lock did not stop execution.')
assert(lockedRunCount === 0, 'A busy advisory lock executed a job.')

console.log('phase8b_cron_job_runner=pass')
