import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'

import { getPayload } from 'payload'

import config from '../src/payload.config'
import { blogRevalidationQueue, blogRevalidationTaskSlug } from '../src/revalidation/contract'
import { revalidationJobRunnerAdvisoryLockKey } from '../src/revalidation/runner'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const cronSecret = randomBytes(48).toString('base64url')
const webhookSecret = randomBytes(48).toString('base64url')
const fixtureIDs: Array<number | string> = []
let receiverStatus = 204
let deliveredRequests = 0
let validSignatures = 0
const observedDeliveries = (): number => deliveredRequests
const observedValidSignatures = (): number => validSignatures

const reserveLoopbackPort = async (): Promise<number> => {
  const reservation = createServer()
  await new Promise<void>((resolve, reject) => {
    reservation.once('error', reject)
    reservation.listen(0, '127.0.0.1', () => {
      reservation.off('error', reject)
      resolve()
    })
  })
  const address = reservation.address()
  assert(address && typeof address !== 'string', 'Could not reserve a loopback port for the local CMS.')
  await new Promise<void>((resolve, reject) => reservation.close((error) => (error ? reject(error) : resolve())))
  return address.port
}

const port = await reserveLoopbackPort()
const runnerURL = `http://127.0.0.1:${port}/api/internal/revalidation-jobs/run`

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

  deliveredRequests += 1
  await sleep(250)
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
const receiverAddress = receiver.address()
assert(receiverAddress && typeof receiverAddress !== 'string', 'The local receiver did not expose a TCP port.')

const runtimeEnvironment = {
  ...process.env,
  BLOG_REVALIDATION_SECRET: webhookSecret,
  CRON_SECRET: cronSecret,
  PORTFOLIO_REVALIDATION_URL: `http://127.0.0.1:${receiverAddress.port}/api/internal/revalidate`,
}

const payload = await getPayload({ config })
let nextProcess: ChildProcess | undefined

const queueFixture = async (queue = blogRevalidationQueue) => {
  const job = await payload.jobs.queue({
    input: {
      categorySlug: 'phase-8b-cron',
      eventId: randomUUID(),
      id: 8_080_001,
      operation: 'publish',
      slug: 'phase-8b-cron',
      version: 1,
    },
    queue,
    task: blogRevalidationTaskSlug,
  } as never)
  fixtureIDs.push(job.id)
  return job
}

const request = (authorization?: string, method = 'GET') =>
  fetch(runnerURL, {
    headers: authorization ? { Authorization: authorization } : undefined,
    method,
  })

const waitForRunner = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await request()
      if (response.status === 401) return
    } catch {
      // The Next server is still starting.
    }
    await sleep(250)
  }
  throw new Error('Timed out waiting for the local cron route.')
}

const exitCode = (child: ChildProcess): Promise<number | null> =>
  new Promise((resolve) => child.once('exit', (code) => resolve(code)))

try {
  const build = spawn(process.execPath, ['run', 'build'], {
    cwd: process.cwd(),
    env: runtimeEnvironment,
    stdio: 'ignore',
  })
  assert((await exitCode(build)) === 0, 'The temporary local build for the cron route failed.')

  nextProcess = spawn(process.execPath, ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: runtimeEnvironment,
    stdio: 'ignore',
  })
  await waitForRunner()

  await queueFixture()
  const unrelated = await queueFixture('phase-8b-unrelated')

  assert((await request()).status === 401, 'A request without bearer authentication was accepted.')
  assert((await request('Basic token')).status === 401, 'A malformed Authorization header was accepted.')
  assert((await request(`Bearer ${randomBytes(48).toString('base64url')}`)).status === 401, 'An invalid bearer token was accepted.')
  assert((await request(`Bearer ${cronSecret}`, 'POST')).status === 405, 'A non-GET cron request was accepted.')
  assert(observedDeliveries() === 0, 'A rejected cron request dispatched a job.')

  const lockClient = await payload.db.pool.connect()
  try {
    await lockClient.query('SELECT pg_advisory_lock($1)', [revalidationJobRunnerAdvisoryLockKey])
    const lockResponse = await request(`Bearer ${cronSecret}`)
    assert(lockResponse.status === 202, `A request did not stop when the shared runner lock was held (HTTP ${lockResponse.status}).`)
    assert(observedDeliveries() === 0, 'A lock-contended request dispatched a job.')
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock($1)', [revalidationJobRunnerAdvisoryLockKey])
    lockClient.release()
  }

  assert((await request(`Bearer ${cronSecret}`)).status === 200, 'An authorized cron request did not complete.')
  assert(observedDeliveries() === 1 && observedValidSignatures() === 1, 'The authorized runner did not deliver exactly one valid signed event.')

  const unrelatedAfterRun = (await payload.findByID({
    collection: 'payload-jobs',
    id: unrelated.id,
    overrideAccess: true,
  })) as { completedAt?: string | null }
  assert(!unrelatedAfterRun.completedAt, 'The bounded runner executed a job from another queue.')

  receiverStatus = 503
  const failed = await queueFixture()
  assert((await request(`Bearer ${cronSecret}`)).status === 200, 'The runner did not return a bounded response for a transient receiver failure.')
  const failedAfterDelivery = (await payload.findByID({
    collection: 'payload-jobs',
    id: failed.id,
    overrideAccess: true,
  })) as { completedAt?: string | null }
  assert(!failedAfterDelivery.completedAt, 'A transient receiver failure incorrectly completed the fixture job.')

  receiverStatus = 204
  await payload.update({
    collection: 'payload-jobs',
    data: { error: null, hasError: false, processing: false, waitUntil: null },
    id: failed.id,
    overrideAccess: true,
  })
  assert((await request(`Bearer ${cronSecret}`)).status === 200, 'The controlled replayed fixture did not run.')
  assert(observedValidSignatures() >= 2, 'The recovered fixture did not reach the receiver with a valid signature.')
} finally {
  for (const id of fixtureIDs) {
    try {
      await payload.delete({ collection: 'payload-jobs', id, overrideAccess: true })
    } catch {
      // A successful Payload job may already have been removed by queue retention.
    }
  }

  await new Promise<void>((resolve, reject) => receiver.close((error) => (error ? reject(error) : resolve())))
  if (nextProcess) {
    nextProcess.kill('SIGTERM')
    await Promise.race([
      new Promise<void>((resolve) => nextProcess?.once('exit', () => resolve())),
      sleep(5_000),
    ])
  }
}

console.log('phase8b_cron_job_runner_live=pass')
