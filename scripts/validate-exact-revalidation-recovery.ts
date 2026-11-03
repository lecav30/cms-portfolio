import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'

import { getPayload } from 'payload'

import config from '../src/payload.config'
import { blogRevalidationQueue, blogRevalidationTaskSlug } from '../src/revalidation/contract'
import { classifyDatabaseTarget } from '../src/revalidation/exactRecovery'
import { revalidationJobRunnerAdvisoryLockKey } from '../src/revalidation/runner'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const webhookSecret = randomBytes(48).toString('base64url')
const fixtureIDs: Array<number | string> = []
let deliveries = 0
let validSignatures = 0
let receiverStatus = 204
const observedDeliveries = (): number => deliveries
const observedValidSignatures = (): number => validSignatures

const receiver = createServer(async (request, response) => {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))

  const body = Buffer.concat(chunks)
  const timestamp = request.headers['x-blog-revalidation-timestamp']
  const signature = request.headers['x-blog-revalidation-signature']
  const expected = typeof timestamp === 'string'
    ? `sha256=${createHmac('sha256', webhookSecret).update(`${timestamp}.`).update(body).digest('hex')}`
    : undefined

  if (expected && typeof signature === 'string') {
    const expectedBuffer = Buffer.from(expected, 'utf8')
    const receivedBuffer = Buffer.from(signature, 'utf8')
    if (expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer)) {
      validSignatures += 1
    }
  }

  deliveries += 1
  response.statusCode = receiverStatus
  response.end()
})

await new Promise<void>((resolve, reject) => {
  receiver.once('error', reject)
  receiver.listen(0, '127.0.0.1', () => {
    receiver.off('error', reject)
    resolve()
  })
})

const address = receiver.address()
assert(address && typeof address !== 'string', 'The local receiver did not expose a TCP port.')

const runtimeEnvironment = {
  ...process.env,
  BLOG_REVALIDATION_SECRET: webhookSecret,
  PORTFOLIO_REVALIDATION_URL: `http://127.0.0.1:${address.port}/api/internal/revalidate`,
}

const runRecoveryCLI = async (argumentsList: string[]) => {
  const child = spawn('bun', ['scripts/recover-revalidation-jobs.ts', ...argumentsList], {
    cwd: process.cwd(),
    env: runtimeEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  let errorOutput = ''
  child.stdout.on('data', (chunk) => {
    output += String(chunk)
  })
  child.stderr.on('data', (chunk) => {
    errorOutput += String(chunk)
  })

  const code = await new Promise<number | null>((resolve) => child.once('exit', resolve))
  return { code, errorOutput, output }
}

const payload = await getPayload({ config })
assert(classifyDatabaseTarget(process.env) === 'local', 'This validation only permits a loopback local PostgreSQL target.')

const queueFixture = async (queue = blogRevalidationQueue) => {
  const job = await payload.jobs.queue({
    input: {
      categorySlug: 'phase-8h4-recovery',
      eventId: randomUUID(),
      id: 8_080_004,
      operation: 'publish',
      slug: 'phase-8h4-recovery',
      version: 1,
    },
    queue,
    task: blogRevalidationTaskSlug,
  } as never)
  fixtureIDs.push(job.id)
  return job
}

const markFailed = async (id: number | string) => {
  await payload.update({
    collection: 'payload-jobs',
    data: {
      error: { message: 'phase-8h4 disposable failure fixture' },
      hasError: true,
      processing: false,
      totalTried: 4,
      waitUntil: null,
    },
    id,
    overrideAccess: true,
  })
}

try {
  const targetOne = await queueFixture()
  const targetTwo = await queueFixture()
  const unrelatedReady = await queueFixture()
  const wrongQueue = await queueFixture('phase-8h4-unrelated')
  const wrongTask = await queueFixture()
  const completed = await queueFixture()
  await markFailed(targetOne.id)
  await markFailed(targetTwo.id)
  await markFailed(wrongQueue.id)
  await markFailed(wrongTask.id)
  await payload.update({
    collection: 'payload-jobs',
    data: { taskSlug: 'inline' },
    id: wrongTask.id,
    overrideAccess: true,
  })
  await payload.update({
    collection: 'payload-jobs',
    data: { completedAt: new Date().toISOString() },
    id: completed.id,
    overrideAccess: true,
  })

  const ids = [Number(targetOne.id), Number(targetTwo.id)].sort((left, right) => left - right)
  const confirmIDs = ids.join(',')

  const dryRun = await runRecoveryCLI(['--id', String(ids[1]), '--id', String(ids[0]), '--id', String(ids[0])])
  assert(dryRun.code === 0, 'Read-only inspection did not complete.')
  assert(dryRun.output.includes(`"ids":[${confirmIDs}]`), 'Duplicate IDs were not normalized deterministically.')
  assert(observedDeliveries() === 0, 'Read-only inspection dispatched a job.')

  assert((await runRecoveryCLI([])).code !== 0, 'A missing ID selection was accepted.')
  assert((await runRecoveryCLI(['--id', '0'])).code !== 0, 'A zero ID selection was accepted.')
  assert((await runRecoveryCLI(['--id', String(targetOne.id), '--execute'])).code !== 0, 'Execution without a matching confirmation was accepted.')
  assert(
    (await runRecoveryCLI(['--id', String(targetOne.id), '--id', String(wrongQueue.id)])).code !== 0,
    'A mixed queue selection was accepted.',
  )
  assert(
    (await runRecoveryCLI(['--id', String(wrongTask.id)])).code !== 0,
    'A wrong-task selection was accepted.',
  )
  assert(
    (await runRecoveryCLI(['--id', String(unrelatedReady.id)])).code !== 0,
    'A non-failed job selection was accepted.',
  )
  assert(
    (await runRecoveryCLI(['--id', String(completed.id)])).code !== 0,
    'A completed job selection was accepted.',
  )
  assert(observedDeliveries() === 0, 'Rejected input dispatched a job.')

  const lockClient = await payload.db.pool.connect()
  try {
    await lockClient.query('SELECT pg_advisory_lock($1)', [revalidationJobRunnerAdvisoryLockKey])
    const lockContention = await runRecoveryCLI([
      '--id', String(ids[0]), '--id', String(ids[1]), '--execute', '--confirm-ids', confirmIDs,
    ])
    assert(lockContention.code === 2, 'Lock contention did not stop exact recovery.')
    assert(observedDeliveries() === 0, 'Lock-contended recovery dispatched a job.')
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock($1)', [revalidationJobRunnerAdvisoryLockKey])
    lockClient.release()
  }

  const recovered = await runRecoveryCLI([
    '--id', String(ids[0]), '--id', String(ids[1]), '--execute', '--confirm-ids', confirmIDs,
  ])
  assert(recovered.code === 0, 'The exact-ID recovery command did not complete successfully.')
  assert(
    observedDeliveries() === 2 && observedValidSignatures() === 2,
    'Only the two selected jobs were not delivered with valid signatures.',
  )

  const unrelatedAfterRecovery = await payload.findByID({
    collection: 'payload-jobs',
    id: unrelatedReady.id,
    overrideAccess: true,
  }) as { completedAt?: string | null; processing?: boolean | null }
  assert(!unrelatedAfterRecovery.completedAt && !unrelatedAfterRecovery.processing, 'Exact recovery processed an unrelated ready job.')

  const repeat = await runRecoveryCLI(['--id', String(ids[0]), '--id', String(ids[1])])
  assert(repeat.code !== 0, 'Completed recovery IDs were accepted for a repeat run.')
  assert(observedDeliveries() === 2, 'A repeated recovery redelivered completed jobs.')

  const transientFailure = await queueFixture()
  await markFailed(transientFailure.id)
  receiverStatus = 503
  const partialFailure = await runRecoveryCLI([
    '--id', String(transientFailure.id), '--execute', '--confirm-ids', String(transientFailure.id),
  ])
  assert(partialFailure.code === 1, 'A failed delivery was reported as a successful recovery.')
  assert(
    observedDeliveries() === 3 && observedValidSignatures() === 3,
    'The transient failure was not sent as an exact selected delivery.',
  )
  receiverStatus = 204
} finally {
  for (const id of fixtureIDs) {
    try {
      await payload.delete({ collection: 'payload-jobs', id, overrideAccess: true })
    } catch {
      // Payload deletes successful jobs by default; only this script's IDs are ignored here.
    }
  }
  await new Promise<void>((resolve, reject) => receiver.close((error) => (error ? reject(error) : resolve())))
  await payload.destroy()
}

console.log('phase8h4_exact_recovery=pass')
process.exit(0)
