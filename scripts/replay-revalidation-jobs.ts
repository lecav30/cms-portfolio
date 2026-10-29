import { getPayload } from 'payload'

import config from '../src/payload.config'
import { blogRevalidationQueue } from '../src/revalidation/contract'

const payload = await getPayload({ config })
const reset = await payload.update({
  collection: 'payload-jobs',
  data: {
    error: null,
    hasError: false,
    processing: false,
    waitUntil: null,
  },
  overrideAccess: true,
  where: {
    and: [
      { queue: { equals: blogRevalidationQueue } },
      { hasError: { equals: true } },
    ],
  },
})

await payload.jobs.run({ limit: 10, queue: blogRevalidationQueue, sequential: true })
console.log(`blog_revalidation_replayed=${reset.docs.length}`)
