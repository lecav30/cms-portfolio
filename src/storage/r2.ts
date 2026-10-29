import { s3Storage } from '@payloadcms/storage-s3'
import { sanitizeFilename } from 'payload/shared'

const r2EndpointSuffix = '.r2.cloudflarestorage.com'
const mediaPrefix = 'media'

type R2Configuration = {
  accessKeyID: string
  bucket: string
  endpoint: string
  publicBaseURL: string
  secretAccessKey: string
}

const requiredR2Variables = [
  'R2_BUCKET',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_PUBLIC_BASE_URL',
] as const

const requireOrigin = (value: string, name: string): string => {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} must be an absolute HTTPS origin without a path.`)
  }

  if (
    url.protocol !== 'https:' ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(`${name} must be an absolute HTTPS origin without a path.`)
  }

  return url.origin
}

export const resolveR2Configuration = (): R2Configuration | undefined => {
  const enabled = process.env.R2_ENABLED

  if (enabled && enabled !== 'true' && enabled !== 'false') {
    throw new Error('R2_ENABLED must be either "true" or "false".')
  }

  if (enabled !== 'true') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('R2_ENABLED=true is required in production. Refusing local media storage.')
    }

    return undefined
  }

  const missing = requiredR2Variables.filter((name) => !process.env[name])

  if (missing.length > 0) {
    throw new Error(`R2_ENABLED=true requires: ${missing.join(', ')}.`)
  }

  const endpoint = requireOrigin(process.env.R2_ENDPOINT as string, 'R2_ENDPOINT')

  if (!new URL(endpoint).hostname.endsWith(r2EndpointSuffix)) {
    throw new Error(`R2_ENDPOINT must use the Cloudflare R2 endpoint suffix ${r2EndpointSuffix}.`)
  }

  return {
    accessKeyID: process.env.R2_ACCESS_KEY_ID as string,
    bucket: process.env.R2_BUCKET as string,
    endpoint,
    publicBaseURL: requireOrigin(process.env.R2_PUBLIC_BASE_URL as string, 'R2_PUBLIC_BASE_URL'),
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
  }
}

/**
 * The S3 endpoint is only for server-side API calls. Public media URLs use the
 * configured R2 custom hostname (or a test r2.dev hostname), never the API
 * endpoint or credentials.
 */
export const buildPublicMediaURL = ({
  filename,
  publicBaseURL,
  prefix = mediaPrefix,
}: {
  filename: string
  prefix?: string
  publicBaseURL: string
}): string => {
  const safeFilename = sanitizeFilename(filename)
  const safePrefix = prefix
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  const objectPath = [safePrefix || mediaPrefix, encodeURIComponent(safeFilename)].join('/')

  return new URL(objectPath, `${publicBaseURL}/`).toString()
}

/**
 * The disabled form still inserts stable url/prefix fields. That prevents a
 * schema drift when local development later opts into R2, while its adapter is
 * never constructed and local filesystem storage remains explicit in dev.
 */
export const r2StoragePlugin = () => {
  const r2 = resolveR2Configuration()

  return s3Storage({
    alwaysInsertFields: true,
    bucket: r2?.bucket ?? 'local-media',
    collections: {
      media: r2
        ? {
            disablePayloadAccessControl: true,
            generateFileURL: ({ filename, prefix }) =>
              buildPublicMediaURL({
                filename,
                prefix: prefix || mediaPrefix,
                publicBaseURL: r2.publicBaseURL,
              }),
            prefix: mediaPrefix,
          }
        : {
            prefix: mediaPrefix,
          },
    },
    config: r2
      ? {
          credentials: {
            accessKeyId: r2.accessKeyID,
            secretAccessKey: r2.secretAccessKey,
          },
          endpoint: r2.endpoint,
          region: 'auto',
        }
      : {},
    enabled: Boolean(r2),
  })
}
