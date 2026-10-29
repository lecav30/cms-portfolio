import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'

import { Users, usersSlug } from './collections/Users'
import { Categories } from './collections/Categories'
import { Media } from './collections/Media'
import { Posts } from './collections/Posts'
import { Tags } from './collections/Tags'
import { r2StoragePlugin } from './storage/r2'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const requiredEnv = (name: 'DATABASE_URL' | 'PAYLOAD_SECRET'): string => {
  const value = process.env[name]

  if (!value) {
    throw new Error(`${name} must be set before Payload can start.`)
  }

  return value
}

const parseOrigins = (value: string | undefined): string[] =>
  value
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? []

const databaseURL = requiredEnv('DATABASE_URL')
const secret = requiredEnv('PAYLOAD_SECRET')
const allowedOrigins = parseOrigins(process.env.CORS_ORIGINS)

export default buildConfig({
  admin: {
    user: usersSlug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Categories, Tags, Media, Posts],
  cors: allowedOrigins,
  csrf: allowedOrigins,
  db: postgresAdapter({
    // Neon URLs must include `sslmode=require`; node-postgres reads that from
    // DATABASE_URL. Do not disable certificate verification in application code.
    pool: {
      connectionString: databaseURL,
    },
    migrationDir: path.resolve(dirname, 'migrations'),
  }),
  editor: lexicalEditor({}),
  graphQL: {
    // REST is the defined portfolio integration contract. Disable an unused API
    // surface instead of maintaining a second public query contract in Phase 2.
    disable: true,
  },
  onInit: async (payload) => {
    const email = process.env.INITIAL_ADMIN_EMAIL
    const password = process.env.INITIAL_ADMIN_PASSWORD

    if (!email || !password) {
      return
    }

    const { totalDocs } = await payload.count({
      collection: usersSlug,
      overrideAccess: true,
    })

    if (totalDocs === 0) {
      await payload.create({
        collection: usersSlug,
        data: { email, password },
        overrideAccess: true,
      })
      payload.logger.info('Initial CMS administrator created. Remove INITIAL_ADMIN_* variables now.')
    }
  },
  plugins: [r2StoragePlugin()],
  routes: {
    admin: '/admin',
  },
  secret,
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL,
  upload: {
    // Payload's Fetch API upload handler passes this to Busboy. Media is the
    // only upload collection in Phase 2, so this is the enforced 5 MiB limit.
    abortOnLimit: true,
    limits: {
      fileSize: 5 * 1024 * 1024,
    },
  },
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
