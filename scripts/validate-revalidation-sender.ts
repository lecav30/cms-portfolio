import { createHmac } from 'node:crypto'

import {
  eventForPublicChange,
  eventForPublicDelete,
  isBlogRevalidationEvent,
  type BlogRevalidationEvent,
  type PublicPostState,
} from '../src/revalidation/contract'
import { resolveBlogRevalidationConfiguration } from '../src/revalidation/config'
import { createRevalidationDelivery, deliverBlogRevalidation, RetryableRevalidationError } from '../src/revalidation/delivery'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const secret = '0123456789abcdef0123456789abcdef'
const current: PublicPostState = {
  categorySlug: 'arquitectura-nueva',
  id: 42,
  slug: 'slug-nueva',
  updatedAt: '2026-10-29T12:00:01.000Z',
}
const previous: PublicPostState = {
  categorySlug: 'arquitectura-anterior',
  id: 42,
  slug: 'slug-anterior',
  updatedAt: '2026-10-29T12:00:00.000Z',
}

const publish = eventForPublicChange({ current })
assert(publish?.operation === 'publish', 'Publishing did not create a publish event.')
assert(publish.post.slug === current.slug && publish.post.categorySlug === current.categorySlug, 'Publish event omitted its public location.')

const update = eventForPublicChange({ current, previous })
assert(update?.operation === 'update', 'A published edit did not create an update event.')
assert(update.post.previousSlug === previous.slug, 'A moved slug omitted its previous location.')
assert(update.post.previousCategorySlug === previous.categorySlug, 'A moved category omitted its previous location.')

assert(!eventForPublicChange({ current: { ...previous }, previous }), 'A draft-only save with unchanged public state created an unnecessary event.')

const unpublish = eventForPublicChange({ previous })
assert(unpublish?.operation === 'unpublish', 'Unpublishing did not create an unpublish event.')
assert(unpublish.post.previousSlug === previous.slug, 'Unpublish event omitted its previous slug.')

const deleted = eventForPublicDelete(previous)
assert(deleted?.operation === 'delete', 'Deleting a public post did not create a delete event.')
assert(deleted.post.previousCategorySlug === previous.categorySlug, 'Delete event omitted its previous category.')

const event = update as BlogRevalidationEvent
assert(isBlogRevalidationEvent(event), 'A valid sender event failed the receiver-compatible validation.')
assert(!isBlogRevalidationEvent({ ...event, unexpected: true }), 'An event with an extra field was accepted.')
assert(!isBlogRevalidationEvent({ ...event, eventId: 'not-a-uuid' }), 'An invalid event ID was accepted.')

const configuration = resolveBlogRevalidationConfiguration({
  BLOG_REVALIDATION_SECRET: secret,
  PORTFOLIO_REVALIDATION_URL: 'http://127.0.0.1:3000/api/internal/revalidate',
})
assert(configuration, 'Valid loopback development configuration was rejected.')
assert(resolveBlogRevalidationConfiguration({}) === undefined, 'An absent local opt-in configuration was not disabled.')
assert(
  (() => {
    try {
      resolveBlogRevalidationConfiguration({
        BLOG_REVALIDATION_SECRET: secret,
        PORTFOLIO_REVALIDATION_URL: 'http://portfolio.example.test/api/internal/revalidate',
      })
      return false
    } catch {
      return true
    }
  })(),
  'Non-loopback HTTP configuration was accepted.',
)

const delivery = createRevalidationDelivery(event, secret, 1_700_000_000_000)
const expectedSignature = `sha256=${createHmac('sha256', secret)
  .update(`${delivery.timestamp}.`)
  .update(delivery.body)
  .digest('hex')}`
assert(delivery.signature === expectedSignature, 'Signature was not computed from timestamp plus exact raw JSON bytes.')
assert(Buffer.compare(delivery.body, Buffer.from(JSON.stringify(event), 'utf8')) === 0, 'Serialized delivery body changed before signing.')

let captured: RequestInit | undefined
const delivered = await deliverBlogRevalidation({
  configuration,
  event,
  fetchImplementation: async (_url, init) => {
    captured = init
    return new Response(null, { status: 204 })
  },
  now: 1_700_000_000_000,
})
assert(delivered.status === 204, 'A 204 receiver response was not treated as success.')
assert(captured?.headers instanceof Object, 'Sender did not provide webhook headers.')

const rejected = await deliverBlogRevalidation({
  configuration,
  event,
  fetchImplementation: async () => new Response(null, { status: 401 }),
})
assert(rejected.status === 401, 'Non-retryable receiver rejection was not returned to the task.')

try {
  await deliverBlogRevalidation({
    configuration,
    event,
    fetchImplementation: async () => new Response(null, { status: 503 }),
  })
  throw new Error('Transient receiver failure did not throw.')
} catch (error) {
  assert(error instanceof RetryableRevalidationError, 'Transient receiver failure was not classified as retryable.')
}

console.log('phase5b_revalidation_sender=pass')
