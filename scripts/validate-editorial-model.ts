import { getPayload } from 'payload'

import config from '../src/payload.config'
import type { Post } from '../src/payload-types'

const origin = process.env.CMS_TEST_ORIGIN ?? 'http://127.0.0.1:3011'

const richText: NonNullable<Post['content']> = {
  root: {
    children: [
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'Contenido de validación temporal.',
            type: 'text',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'paragraph',
        textFormat: 0,
        version: 1,
      },
    ],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
}

const testPNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9JZCcAAAAASUVORK5CYII=',
  'base64',
)

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

const expectHTTP = async (path: string, expectedStatus: number, init?: RequestInit): Promise<Response> => {
  const response = await fetch(`${origin}${path}`, init)
  assert(response.status === expectedStatus, `${path} returned ${response.status}, expected ${expectedStatus}`)
  return response
}

const expectNotPublic = async (path: string): Promise<void> => {
  const response = await fetch(`${origin}${path}`)
  assert(!response.ok, `${path} unexpectedly returned a public success response.`)
}

const expectRejected = async (operation: () => Promise<unknown>, label: string): Promise<void> => {
  try {
    await operation()
  } catch {
    return
  }

  throw new Error(`${label} unexpectedly succeeded`)
}

const main = async (): Promise<void> => {
  const payload = await getPayload({ config })
  const admins = await payload.find({
    collection: 'users',
    limit: 1,
    overrideAccess: true,
  })
  const admin = admins.docs[0]

  assert(admin, 'A local administrator is required for editorial validation.')

  let categoryID: number | string | undefined
  let tagID: number | string | undefined
  let mediaID: number | string | undefined
  let postID: number | string | undefined

  try {
    const category = await payload.create({
      collection: 'categories',
      data: {
        description: 'Registro temporal de validación.',
        name: 'Tecnología Ágil',
        slug: 'Tecnología Ágil',
      },
      overrideAccess: false,
      user: admin,
    })
    categoryID = category.id
    assert(category.slug === 'tecnologia-agil', 'Category slug was not normalized deterministically.')

    await expectRejected(
      () =>
        payload.create({
          collection: 'categories',
          data: { name: 'Tecnología Ágil', slug: 'Tecnología Ágil' },
          overrideAccess: false,
          user: admin,
        }),
      'Duplicate category slug',
    )

    await payload.update({
      collection: 'categories',
      data: { description: 'Registro temporal actualizado.' },
      id: categoryID,
      overrideAccess: false,
      user: admin,
    })

    const tag = await payload.create({
      collection: 'tags',
      data: { name: 'Pruebas Técnicas', slug: 'Pruebas Técnicas' },
      overrideAccess: false,
      user: admin,
    })
    tagID = tag.id
    assert(tag.slug === 'pruebas-tecnicas', 'Tag slug was not normalized deterministically.')

    await payload.update({
      collection: 'tags',
      data: { name: 'Pruebas de Integración' },
      id: tagID,
      overrideAccess: false,
      user: admin,
    })

    await expectRejected(
      () =>
        payload.create({
          collection: 'media',
          data: { alt: 'Archivo no permitido de validación.' },
          file: {
            data: Buffer.from('<html></html>'),
            mimetype: 'text/html',
            name: 'phase-2-validation.html',
            size: 13,
          },
          overrideAccess: false,
          user: admin,
        }),
      'Unsupported Media MIME type',
    )

    const media = await payload.create({
      collection: 'media',
      data: { alt: 'Imagen temporal para validar relaciones.' },
      file: {
        data: testPNG,
        mimetype: 'image/png',
        name: 'phase-2-validation.png',
        size: testPNG.length,
      },
      overrideAccess: false,
      user: admin,
    })
    mediaID = media.id

    await payload.update({
      collection: 'media',
      data: { alt: 'Imagen temporal actualizada para validar relaciones.' },
      id: mediaID,
      overrideAccess: false,
      user: admin,
    })

    const draft = await payload.create({
      collection: 'posts',
      data: {
        canonicalUrl: 'https://example.invalid/phase-2-validation',
        category: categoryID,
        content: richText,
        contentType: 'article',
        coverImage: mediaID,
        excerpt: 'Documento temporal de validación.',
        noIndex: true,
        seoDescription: 'Descripción temporal de validación para la API editorial.',
        seoTitle: 'Validación temporal',
        tags: [tagID],
        title: 'Borrador privado de validación',
      },
      draft: true,
      overrideAccess: false,
      user: admin,
    })
    postID = draft.id
    assert(draft.slug === 'borrador-privado-de-validacion', 'Post slug was not normalized deterministically.')
    assert(draft._status === 'draft', 'A new editorial post must default to draft.')

    await expectHTTP(`/api/posts/${postID}`, 404)
    await expectHTTP(`/api/posts/${postID}?draft=true`, 404)
    await expectNotPublic(`/api/posts/${postID}/versions`)
    const draftFilter = await expectHTTP('/api/posts?where%5B_status%5D%5Bequals%5D=draft&depth=10', 200)
    const draftFilterBody = (await draftFilter.json()) as { docs?: Array<{ id?: number | string }> }
    assert(!draftFilterBody.docs?.some((post) => post.id === postID), 'Draft filter bypassed public access.')

    const published = await payload.update({
      collection: 'posts',
      data: { _status: 'published' },
      id: postID,
      overrideAccess: false,
      user: admin,
    })
    assert(published._status === 'published', 'Post did not publish.')
    assert(typeof published.publishedAt === 'string', 'Publishing did not set publishedAt.')
    const firstPublishedAt = published.publishedAt

    const publicList = await expectHTTP('/api/posts?depth=5', 200)
    const publicListBody = (await publicList.json()) as { docs?: Array<{ id?: number | string }> }
    assert(publicListBody.docs?.some((post) => post.id === postID), 'Published post missing from public list.')

    const publicDetail = await expectHTTP(`/api/posts/${postID}?depth=5`, 200)
    const publicDetailBody = (await publicDetail.json()) as {
      canonicalUrl?: string
      coverImage?: { alt?: string }
      id?: number | string
      noIndex?: boolean
      seoDescription?: string
      seoTitle?: string
    }
    assert(publicDetailBody.id === postID, 'Public detail did not return the published post.')
    assert(
      publicDetailBody.coverImage?.alt === 'Imagen temporal actualizada para validar relaciones.',
      'Public post did not expose the approved media relationship.',
    )
    assert(publicDetailBody.canonicalUrl === 'https://example.invalid/phase-2-validation', 'Canonical URL did not serialize.')
    assert(publicDetailBody.seoTitle === 'Validación temporal', 'SEO title did not serialize.')
    assert(publicDetailBody.seoDescription === 'Descripción temporal de validación para la API editorial.', 'SEO description did not serialize.')
    assert(publicDetailBody.noIndex === true, 'noIndex did not serialize.')

    await expectHTTP('/api/categories', 200)
    await expectHTTP('/api/tags', 200)
    const publicMedia = await expectHTTP(`/api/media/${mediaID}`, 200)
    const publicMediaBody = (await publicMedia.json()) as Record<string, unknown>
    assert(!('email' in publicMediaBody || 'hash' in publicMediaBody || 'salt' in publicMediaBody), 'Public media leaked user data.')

    for (const collection of ['categories', 'tags', 'media', 'posts']) {
      await expectHTTP(`/api/${collection}`, 403, {
        body: '{}',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
    }

    const unpublished = await payload.update({
      collection: 'posts',
      data: { _status: 'draft' },
      id: postID,
      overrideAccess: false,
      user: admin,
    })
    assert(unpublished._status === 'draft', 'Post did not unpublish.')
    await expectHTTP(`/api/posts/${postID}`, 404)

    const republished = await payload.update({
      collection: 'posts',
      data: { _status: 'published' },
      id: postID,
      overrideAccess: false,
      user: admin,
    })
    assert(republished.publishedAt === firstPublishedAt, 'publishedAt changed after re-publishing.')
  } finally {
    if (postID) {
      await payload.delete({ collection: 'posts', id: postID, overrideAccess: false, user: admin })
    }
    if (mediaID) {
      await payload.delete({ collection: 'media', id: mediaID, overrideAccess: false, user: admin })
    }
    if (tagID) {
      await payload.delete({ collection: 'tags', id: tagID, overrideAccess: false, user: admin })
    }
    if (categoryID) {
      await payload.delete({ collection: 'categories', id: categoryID, overrideAccess: false, user: admin })
    }
  }

  console.log('phase2_editorial_local_api=pass')
}

await main()
