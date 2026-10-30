import { getPayload } from 'payload'

import config from '../../../../../payload.config'
import { isAuthorizedCronRequest, resolveCronSecret } from '../../../../../revalidation/cron'
import { runQueuedRevalidationJobs } from '../../../../../revalidation/runner'

export const dynamic = 'force-dynamic'
// Next 16 requires a literal route-segment configuration value.
export const maxDuration = 15
export const runtime = 'nodejs'

const noStoreHeaders = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
}

const response = (body: Record<string, string | number | boolean>, status: number): Response =>
  Response.json(body, { headers: noStoreHeaders, status })

export const GET = async (request: Request): Promise<Response> => {
  const secret = resolveCronSecret()

  if (!secret) return response({ error: 'Service unavailable.' }, 503)
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), secret)) return response({ error: 'Unauthorized.' }, 401)

  try {
    const payload = await getPayload({ config })
    const result = await runQueuedRevalidationJobs(payload)

    if (result.status === 'already-running') return response({ status: result.status }, 202)

    return response(
      {
        noJobsRemaining: result.noJobsRemaining,
        remainingJobsFromQueried: result.remainingJobsFromQueried,
        status: result.status,
      },
      200,
    )
  } catch {
    return response({ error: 'Unable to run revalidation jobs.' }, 500)
  }
}

const methodNotAllowed = (): Response =>
  new Response(null, {
    headers: {
      ...noStoreHeaders,
      Allow: 'GET',
    },
    status: 405,
  })

export const DELETE = methodNotAllowed
export const PATCH = methodNotAllowed
export const POST = methodNotAllowed
export const PUT = methodNotAllowed
