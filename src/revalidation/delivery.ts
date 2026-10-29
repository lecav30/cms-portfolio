import { createHmac } from 'node:crypto'

import type { BlogRevalidationEvent } from './contract'
import type { BlogRevalidationConfiguration } from './config'

export const revalidationTimeoutMilliseconds = 5_000

export class RetryableRevalidationError extends Error {}

export type RevalidationDelivery = {
  body: Buffer
  signature: string
  timestamp: string
}

export const createRevalidationDelivery = (
  event: BlogRevalidationEvent,
  secret: string,
  now = Date.now(),
): RevalidationDelivery => {
  const body = Buffer.from(JSON.stringify(event), 'utf8')
  const timestamp = String(Math.floor(now / 1000))
  const signature = `sha256=${createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex')}`

  return { body, signature, timestamp }
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>

export const deliverBlogRevalidation = async ({
  configuration,
  event,
  fetchImplementation = fetch,
  now,
}: {
  configuration: BlogRevalidationConfiguration
  event: BlogRevalidationEvent
  fetchImplementation?: Fetch
  now?: number
}): Promise<{ status: number }> => {
  const delivery = createRevalidationDelivery(event, configuration.secret, now)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), revalidationTimeoutMilliseconds)

  try {
    const response = await fetchImplementation(configuration.url, {
      body: delivery.body,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-blog-revalidation-signature': delivery.signature,
        'x-blog-revalidation-timestamp': delivery.timestamp,
      },
      method: 'POST',
      signal: controller.signal,
    })

    if (response.status === 204) return { status: response.status }

    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      throw new RetryableRevalidationError(`Portfolio revalidation returned transient HTTP ${response.status}.`)
    }

    return { status: response.status }
  } catch (error) {
    if (error instanceof RetryableRevalidationError) throw error
    throw new RetryableRevalidationError('Portfolio revalidation request failed or timed out.')
  } finally {
    clearTimeout(timeout)
  }
}
