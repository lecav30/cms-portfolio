import { DeleteObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { resolveR2Configuration } from '../src/storage/r2'

const origin = process.env.CMS_TEST_ORIGIN ?? 'http://127.0.0.1:3011'
const fixturePrefix = `phase-3-r2-${crypto.randomUUID()}`
const mediaDirectory = path.resolve(process.cwd(), 'media')

const firstPNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9JZCcAAAAASUVORK5CYII=',
  'base64',
)
const replacementPNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mNk+M/wHwAF/gL+DhVBjAAAAABJRU5ErkJggg==',
  'base64',
)

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

const countFiles = async (directory: string): Promise<number> => {
  try {
    const entries = await readdir(directory, { withFileTypes: true })

    return (
      await Promise.all(
        entries.map(async (entry) =>
          entry.isDirectory() ? countFiles(path.join(directory, entry.name)) : entry.isFile() ? 1 : 0,
        ),
      )
    ).reduce((total, count) => total + count, 0)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0
    }

    throw error
  }
}

const expectHTTP = async (path: string, expectedStatus: number, init?: RequestInit): Promise<Response> => {
  const response = await fetch(`${origin}${path}`, init)
  assert(response.status === expectedStatus, `${path} returned ${response.status}, expected ${expectedStatus}`)

  return response
}

const expectRejected = async (operation: () => Promise<unknown>, label: string): Promise<void> => {
  try {
    await operation()
  } catch {
    return
  }

  throw new Error(`${label} unexpectedly succeeded`)
}

const isNotFound = (error: unknown): boolean => {
  const candidate = error as { $metadata?: { httpStatusCode?: number }; name?: string }

  return candidate.$metadata?.httpStatusCode === 404 || candidate.name === 'NotFound' || candidate.name === 'NoSuchKey'
}

const main = async (): Promise<void> => {
  const r2 = resolveR2Configuration()
  assert(r2, 'Live R2 validation requires R2_ENABLED=true and complete R2 configuration.')

  const s3 = new S3Client({
    credentials: {
      accessKeyId: r2.accessKeyID,
      secretAccessKey: r2.secretAccessKey,
    },
    endpoint: r2.endpoint,
    region: 'auto',
  })
  const payload = await getPayload({ config })
  const admins = await payload.find({ collection: 'users', limit: 1, overrideAccess: true })
  const admin = admins.docs[0]
  assert(admin, 'A local administrator is required for live R2 validation.')

  const localFilesBefore = await countFiles(mediaDirectory)
  const candidateKeys = new Set<string>()
  let mediaID: number | string | undefined
  let currentKey: string | undefined

  const objectKey = (document: { filename?: string | null; prefix?: string | null }): string => {
    assert(document.filename, 'Media document did not contain a filename.')
    const key = `${document.prefix || 'media'}/${document.filename}`
    candidateKeys.add(key)

    return key
  }

  const assertObjectExists = async (key: string): Promise<void> => {
    const result = await s3.send(new HeadObjectCommand({ Bucket: r2.bucket, Key: key }))
    assert(result.ContentType === 'image/png', 'R2 object did not retain the expected image/png content type.')
  }

  const assertObjectMissing = async (key: string): Promise<void> => {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: r2.bucket, Key: key }))
    } catch (error) {
      if (isNotFound(error)) {
        return
      }

      throw error
    }

    throw new Error('R2 object remained after its expected deletion.')
  }

  try {
    await expectRejected(
      () =>
        payload.create({
          collection: 'media',
          data: { alt: 'Archivo no permitido de validación R2.' },
          file: {
            data: Buffer.from('<html></html>'),
            mimetype: 'text/html',
            name: `${fixturePrefix}.html`,
            size: 13,
          },
          overrideAccess: false,
          user: admin,
        }),
      'Unsupported Media MIME type',
    )

    const media = await payload.create({
      collection: 'media',
      data: { alt: 'Imagen temporal de validación R2.' },
      file: {
        data: firstPNG,
        mimetype: 'image/png',
        name: `${fixturePrefix}-original.png`,
        size: firstPNG.length,
      },
      overrideAccess: false,
      user: admin,
    })
    mediaID = media.id
    const originalKey = objectKey(media)
    currentKey = originalKey

    const publicURL = media.url
    assert(publicURL?.startsWith(`${r2.publicBaseURL}/media/`), 'Media URL did not use the configured public hostname and media prefix.')
    await assertObjectExists(originalKey)

    assert(publicURL, 'Media document did not contain a public URL.')
    const publicResponse = await fetch(publicURL)
    assert(publicResponse.status === 200, `Public media URL returned ${publicResponse.status}, expected 200.`)
    assert(publicResponse.headers.get('content-type')?.startsWith('image/png'), 'Public media URL did not return image/png content.')

    const publicRead = await expectHTTP(`/api/media/${mediaID}`, 200)
    const publicReadBody = (await publicRead.json()) as { id?: number | string; url?: string }
    assert(publicReadBody.id === mediaID, 'Public Media REST read returned the wrong document.')
    assert(publicReadBody.url === publicURL, 'Public Media REST read did not return the configured public URL.')

    for (const [method, pathSuffix] of [
      ['POST', '/api/media'],
      ['PATCH', `/api/media/${mediaID}`],
      ['DELETE', `/api/media/${mediaID}`],
    ] as const) {
      await expectHTTP(pathSuffix, 403, {
        body: method === 'DELETE' ? undefined : '{}',
        headers: method === 'DELETE' ? undefined : { 'content-type': 'application/json' },
        method,
      })
    }

    const oversizedForm = new FormData()
    oversizedForm.set('alt', 'Carga sobredimensionada no autenticada.')
    oversizedForm.set(
      'file',
      new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: 'image/png' }),
      `${fixturePrefix}-oversized.png`,
    )
    const oversizedResponse = await fetch(`${origin}/api/media`, { body: oversizedForm, method: 'POST' })
    assert(!oversizedResponse.ok, `Oversized unauthenticated upload unexpectedly returned ${oversizedResponse.status}.`)

    const authenticatedRead = await payload.findByID({
      collection: 'media',
      id: mediaID,
      overrideAccess: false,
      user: admin,
    })
    assert(authenticatedRead.id === mediaID, 'Authenticated Payload Local API read failed.')

    const replacement = await payload.update({
      collection: 'media',
      data: { alt: 'Imagen temporal R2 reemplazada.' },
      file: {
        data: replacementPNG,
        mimetype: 'image/png',
        name: `${fixturePrefix}-replacement.png`,
        size: replacementPNG.length,
      },
      id: mediaID,
      overrideAccess: false,
      user: admin,
    })
    const replacementKey = objectKey(replacement)
    currentKey = replacementKey
    assert(replacementKey !== originalKey, 'Media replacement did not create a distinct R2 object key.')
    await assertObjectExists(replacementKey)
    await assertObjectMissing(originalKey)

    const replacementURL = replacement.url
    assert(replacementURL, 'Replacement Media document did not contain a public URL.')
    const replacementPublicResponse = await fetch(replacementURL)
    assert(replacementPublicResponse.status === 200, `Replacement public media URL returned ${replacementPublicResponse.status}, expected 200.`)
    assert(
      replacementPublicResponse.headers.get('content-type')?.startsWith('image/png'),
      'Replacement public media URL did not return image/png content.',
    )

    await payload.delete({ collection: 'media', id: mediaID, overrideAccess: false, user: admin })
    mediaID = undefined
    await assertObjectMissing(replacementKey)
    currentKey = undefined

    const localFilesAfter = await countFiles(mediaDirectory)
    assert(localFilesAfter === localFilesBefore, 'R2-enabled validation changed local Media filesystem storage.')

    console.log(`r2_live_public_fetch_status=${publicResponse.status}`)
    console.log(`r2_live_replacement_public_fetch_status=${replacementPublicResponse.status}`)
    console.log(`r2_live_oversized_anonymous_status=${oversizedResponse.status}`)
    console.log('r2_live_upload=pass')
    console.log('r2_live_authenticated_local_api=pass')
    console.log('r2_live_anonymous_mutations=pass')
    console.log('r2_live_replacement=pass')
    console.log('r2_live_deletion=pass')
    console.log('r2_live_cleanup=pass')
  } finally {
    if (mediaID) {
      await payload.delete({ collection: 'media', id: mediaID, overrideAccess: false, user: admin }).catch(() => undefined)
    }

    for (const key of candidateKeys) {
      await s3.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key })).catch(() => undefined)
      await assertObjectMissing(key)
    }

    if (currentKey) {
      await assertObjectMissing(currentKey)
    }
  }
}

await main()
