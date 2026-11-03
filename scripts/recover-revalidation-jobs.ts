import { getPayload } from 'payload'

import config from '../src/payload.config'
import {
  classifyDatabaseTarget,
  inspectExactRevalidationJobs,
  parseExactRecoveryCLIOptions,
  recoverExactRevalidationJobs,
} from '../src/revalidation/exactRecovery'

const options = parseExactRecoveryCLIOptions(process.argv.slice(2))
const target = classifyDatabaseTarget(process.env)

if (options.execute && target !== 'local' && !options.allowProduction) {
  throw new Error('Exact recovery refused execution against a non-local or unverified database without --allow-production.')
}

const payload = await getPayload({ config })
try {
  const inspection = await inspectExactRevalidationJobs(payload, options.ids)

  console.log(JSON.stringify({
    databaseTarget: target,
    ids: options.ids,
    jobs: inspection,
    mode: options.execute ? 'execute' : 'inspect',
  }))

  if (!options.execute) {
    console.log('Exact recovery inspection complete. No job state was changed.')
  } else {
    const result = await recoverExactRevalidationJobs(payload, options.ids)
    console.log(JSON.stringify({ result }))

    if (result.status === 'already-running') {
      process.exitCode = 2
    } else if (result.jobs.some((job) => job.runStatus !== 'success')) {
      process.exitCode = 1
    }
  }
} finally {
  await payload.destroy()
}

// Payload's PostgreSQL adapter can retain an idle reconnect handle after
// `destroy()`. This one-shot operator CLI must not remain alive after it has
// released its database resources.
process.exit(process.exitCode ?? 0)
