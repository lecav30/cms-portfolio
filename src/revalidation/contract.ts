import { randomUUID } from 'node:crypto'

export const blogRevalidationTaskSlug = 'blog-revalidation'
export const blogRevalidationQueue = 'blog-revalidation'
export const blogRevalidationVersion = 1

export type BlogRevalidationOperation = 'publish' | 'update' | 'unpublish' | 'delete'

export type BlogRevalidationEvent = {
  eventId: string
  operation: BlogRevalidationOperation
  post: {
    categorySlug?: string
    id: number
    previousCategorySlug?: string
    previousSlug?: string
    slug?: string
  }
  version: typeof blogRevalidationVersion
}

export type PublicPostState = {
  categorySlug: string
  id: number
  slug: string
  updatedAt: string
}

type PublicChange = {
  current?: PublicPostState
  previous?: PublicPostState
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const eventIDPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const operations = new Set<BlogRevalidationOperation>(['publish', 'update', 'unpublish', 'delete'])

const isSafeSlug = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 160 && slugPattern.test(value)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (value: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key))

export const isBlogRevalidationEvent = (value: unknown): value is BlogRevalidationEvent => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['eventId', 'operation', 'post', 'version'])) return false
  if (
    value.version !== blogRevalidationVersion ||
    typeof value.eventId !== 'string' ||
    !eventIDPattern.test(value.eventId) ||
    typeof value.operation !== 'string' ||
    !operations.has(value.operation as BlogRevalidationOperation) ||
    !isRecord(value.post) ||
    !hasOnlyKeys(value.post, ['categorySlug', 'id', 'previousCategorySlug', 'previousSlug', 'slug']) ||
    typeof value.post.id !== 'number' ||
    !Number.isSafeInteger(value.post.id) ||
    value.post.id <= 0
  ) {
    return false
  }

  for (const field of ['categorySlug', 'previousCategorySlug', 'previousSlug', 'slug']) {
    const slug = value.post[field]
    if (slug !== undefined && !isSafeSlug(slug)) return false
  }

  if ((value.operation === 'publish' || value.operation === 'update') && (!value.post.slug || !value.post.categorySlug)) {
    return false
  }

  return !(
    (value.operation === 'unpublish' || value.operation === 'delete') &&
    (!value.post.previousSlug || !value.post.previousCategorySlug)
  )
}

const createEvent = (operation: BlogRevalidationOperation, post: BlogRevalidationEvent['post']): BlogRevalidationEvent => ({
  eventId: randomUUID(),
  operation,
  post,
  version: blogRevalidationVersion,
})

export const eventForPublicChange = ({ current, previous }: PublicChange): BlogRevalidationEvent | undefined => {
  if (!previous && current) {
    return createEvent('publish', {
      categorySlug: current.categorySlug,
      id: current.id,
      slug: current.slug,
    })
  }

  if (previous && !current) {
    return createEvent('unpublish', {
      id: previous.id,
      previousCategorySlug: previous.categorySlug,
      previousSlug: previous.slug,
    })
  }

  if (!previous || !current || previous.updatedAt === current.updatedAt) return undefined

  return createEvent('update', {
    categorySlug: current.categorySlug,
    id: current.id,
    previousCategorySlug: previous.categorySlug === current.categorySlug ? undefined : previous.categorySlug,
    previousSlug: previous.slug === current.slug ? undefined : previous.slug,
    slug: current.slug,
  })
}

export const eventForPublicDelete = (previous: PublicPostState | undefined): BlogRevalidationEvent | undefined =>
  previous
    ? createEvent('delete', {
        id: previous.id,
        previousCategorySlug: previous.categorySlug,
        previousSlug: previous.slug,
      })
    : undefined
