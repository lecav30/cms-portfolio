import { timingSafeEqual } from 'node:crypto'

export const cronSecretMinimumBytes = 32
export const revalidationJobBatchLimit = 10

type Environment = Record<string, string | undefined>

export const resolveCronSecret = (environment: Environment = process.env): string | undefined => {
  const secret = environment.CRON_SECRET

  if (!secret || secret.trim() !== secret || Buffer.byteLength(secret, 'utf8') < cronSecretMinimumBytes) {
    return undefined
  }

  return secret
}

export const isAuthorizedCronRequest = (authorization: string | null, secret: string | undefined): boolean => {
  if (!authorization || !secret) return false

  const expected = Buffer.from(`Bearer ${secret}`, 'utf8')
  const received = Buffer.from(authorization, 'utf8')

  return received.length === expected.length && timingSafeEqual(received, expected)
}
