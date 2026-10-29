import type { TaskConfig } from 'payload'

import { blogRevalidationTaskSlug, isBlogRevalidationEvent } from './contract'
import { resolveBlogRevalidationConfiguration } from './config'
import { deliverBlogRevalidation } from './delivery'

type TaskInput = {
  categorySlug?: string
  eventId: string
  id: number
  operation: string
  previousCategorySlug?: string
  previousSlug?: string
  slug?: string
  version: number
}

export const blogRevalidationTask: TaskConfig<{ input: TaskInput; output: { outcome: string; status?: number } }> = {
  handler: async ({ input, req }) => {
    const event = {
      eventId: input.eventId,
      operation: input.operation,
      post: {
        categorySlug: input.categorySlug,
        id: input.id,
        previousCategorySlug: input.previousCategorySlug,
        previousSlug: input.previousSlug,
        slug: input.slug,
      },
      version: input.version,
    }

    if (!isBlogRevalidationEvent(event)) {
      throw new Error(`Invalid blog revalidation job payload for event ${input.eventId}.`)
    }

    let configuration
    try {
      configuration = resolveBlogRevalidationConfiguration()
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Portfolio revalidation configuration is invalid.')
    }

    if (!configuration) {
      throw new Error('Portfolio revalidation is not configured for this public-content event.')
    }

    const delivery = await deliverBlogRevalidation({ configuration, event })

    if (delivery.status !== 204) {
      throw new Error(`Portfolio revalidation rejected the event with non-retryable HTTP ${delivery.status}.`)
    }

    req.payload.logger.info({ eventId: event.eventId, msg: 'Portfolio blog cache revalidation delivered.', status: 204 })
    return { output: { outcome: 'delivered', status: 204 } }
  },
  inputSchema: [
    { name: 'eventId', required: true, type: 'text' },
    {
      name: 'operation',
      options: ['publish', 'update', 'unpublish', 'delete'],
      required: true,
      type: 'select',
    },
    { name: 'id', required: true, type: 'number' },
    { name: 'slug', type: 'text' },
    { name: 'categorySlug', type: 'text' },
    { name: 'previousSlug', type: 'text' },
    { name: 'previousCategorySlug', type: 'text' },
    { name: 'version', required: true, type: 'number' },
  ],
  label: 'Revalidate published portfolio blog content',
  retries: {
    attempts: 2,
    backoff: {
      delay: 1_000,
      type: 'exponential',
    },
  },
  slug: blogRevalidationTaskSlug,
}
