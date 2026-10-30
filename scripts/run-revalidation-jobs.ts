import { getPayload } from 'payload'

import config from '../src/payload.config'
import { runQueuedRevalidationJobs } from '../src/revalidation/runner'

const payload = await getPayload({ config })
const result = await runQueuedRevalidationJobs(payload)

if (result.status === 'already-running') {
  console.log('blog_revalidation_runner=already-running')
} else {
  console.log(
    `blog_revalidation_runner=completed remaining_jobs_from_queried=${result.remainingJobsFromQueried} no_jobs_remaining=${result.noJobsRemaining}`,
  )
}
