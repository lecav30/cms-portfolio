import { postgresAdapter } from '@payloadcms/db-postgres'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'

import { Users } from './collections/Users'

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
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users],
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
  onInit: async (payload) => {
    const email = process.env.INITIAL_ADMIN_EMAIL
    const password = process.env.INITIAL_ADMIN_PASSWORD

    if (!email || !password) {
      return
    }

    const { totalDocs } = await payload.count({
      collection: Users.slug,
      overrideAccess: true,
    })

    if (totalDocs === 0) {
      await payload.create({
        collection: Users.slug,
        data: { email, password },
        overrideAccess: true,
      })
      payload.logger.info('Initial CMS administrator created. Remove INITIAL_ADMIN_* variables now.')
    }
  },
  routes: {
    admin: '/admin',
  },
  secret,
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
