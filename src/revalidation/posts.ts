import { after } from 'next/server'
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionBeforeChangeHook, CollectionBeforeDeleteHook, Payload, PayloadRequest } from 'payload'

import { categoriesSlug } from '../collections/Categories'
import {
  blogRevalidationQueue,
  blogRevalidationTaskSlug,
  eventForPublicChange,
  eventForPublicDelete,
  type PublicPostState,
} from './contract'
import { isProductionRuntime, resolveBlogRevalidationConfiguration } from './config'

type PostLike = {
  _status?: 'draft' | 'published' | null
  category?: number | { id: number } | null
  id: number
  slug?: string | null
  updatedAt?: string | null
}

const contextKey = 'blogRevalidationPublicPostStates'

const getStateMap = (req: PayloadRequest): Map<number, PublicPostState | undefined> => {
  const context = req.context as Record<string, unknown>
  const current = context[contextKey]

  if (current instanceof Map) return current as Map<number, PublicPostState | undefined>

  const states = new Map<number, PublicPostState | undefined>()
  context[contextKey] = states
  return states
}

const relationshipID = (value: PostLike['category']): number | undefined => {
  if (typeof value === 'number') return value
  if (value && typeof value.id === 'number') return value.id
  return undefined
}

const readPublicPostState = async ({
  id,
  payload,
  req,
}: {
  id: number
  payload: Payload
  req: PayloadRequest
}): Promise<PublicPostState | undefined> => {
  try {
    const post = (await payload.findByID({
      collection: 'posts',
      depth: 0,
      draft: false,
      id,
      overrideAccess: true,
      req,
    })) as PostLike

    const categoryID = relationshipID(post.category)
    if (post._status !== 'published' || !categoryID || typeof post.slug !== 'string' || typeof post.updatedAt !== 'string') {
      return undefined
    }

    const category = await payload.findByID({
      collection: categoriesSlug,
      depth: 0,
      id: categoryID,
      overrideAccess: true,
      req,
    })

    if (typeof category.slug !== 'string') return undefined

    return { categorySlug: category.slug, id: post.id, slug: post.slug, updatedAt: post.updatedAt }
  } catch {
    return undefined
  }
}

const scheduleQueuedJobs = (payload: Payload): void => {
  try {
    after(async () => {
      try {
        await payload.jobs.run({
          limit: 10,
          queue: blogRevalidationQueue,
          sequential: true,
          silent: { error: false, info: true },
        })
      } catch {
        payload.logger.error({ msg: 'Unable to start queued portfolio revalidation jobs after the CMS response.' })
      }
    })
  } catch {
    // The Local API has no Next request scope. The durable job remains available
    // for `bun run revalidate:jobs` or a production job runner.
  }
}

const queueEvent = async ({ event, req }: { event: NonNullable<ReturnType<typeof eventForPublicChange>>; req: PayloadRequest }): Promise<void> => {
  let configuration
  try {
    configuration = resolveBlogRevalidationConfiguration()
  } catch {
    throw new Error('Portfolio revalidation configuration is invalid. Refusing to save a public-content change without a recoverable notification job.')
  }

  if (!configuration && !isProductionRuntime()) return

  await req.payload.jobs.queue({
    input: {
      categorySlug: event.post.categorySlug,
      eventId: event.eventId,
      id: event.post.id,
      operation: event.operation,
      previousCategorySlug: event.post.previousCategorySlug,
      previousSlug: event.post.previousSlug,
      slug: event.post.slug,
      version: event.version,
    },
    queue: blogRevalidationQueue,
    req,
    task: blogRevalidationTaskSlug,
  })

  scheduleQueuedJobs(req.payload)
}

export const capturePublicPostBeforeChange: CollectionBeforeChangeHook = async ({ originalDoc, req }) => {
  const original = originalDoc as PostLike | undefined
  if (original?.id) {
    getStateMap(req).set(original.id, await readPublicPostState({ id: original.id, payload: req.payload, req }))
  }
}

export const queuePublicPostChange: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  const post = doc as PostLike
  const previous = operation === 'create' ? undefined : getStateMap(req).get(post.id)
  const current = await readPublicPostState({ id: post.id, payload: req.payload, req })
  const event = eventForPublicChange({ current, previous })

  if (event) await queueEvent({ event, req })
}

export const capturePublicPostBeforeDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  if (typeof id === 'number') {
    getStateMap(req).set(id, await readPublicPostState({ id, payload: req.payload, req }))
  }
}

export const queuePublicPostDelete: CollectionAfterDeleteHook = async ({ id, req }) => {
  if (typeof id !== 'number') return

  const event = eventForPublicDelete(getStateMap(req).get(id))
  if (event) await queueEvent({ event, req })
}
