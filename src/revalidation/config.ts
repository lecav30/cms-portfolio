const minimumSecretBytes = 32

export type BlogRevalidationConfiguration = {
  secret: string
  url: string
}

type Environment = Record<string, string | undefined>

const isLoopbackHost = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'

export const resolveBlogRevalidationConfiguration = (
  environment: Environment = process.env,
): BlogRevalidationConfiguration | undefined => {
  const rawURL = environment.PORTFOLIO_REVALIDATION_URL
  const secret = environment.BLOG_REVALIDATION_SECRET

  if (!rawURL && !secret) return undefined

  if (!rawURL || !secret || Buffer.byteLength(secret.trim(), 'utf8') < minimumSecretBytes) {
    throw new Error('Portfolio revalidation requires both PORTFOLIO_REVALIDATION_URL and a 32-byte BLOG_REVALIDATION_SECRET.')
  }

  let url: URL
  try {
    url = new URL(rawURL)
  } catch {
    throw new Error('PORTFOLIO_REVALIDATION_URL must be an absolute URL.')
  }

  if (url.username || url.password || url.search || url.hash || url.pathname !== '/api/internal/revalidate') {
    throw new Error('PORTFOLIO_REVALIDATION_URL must be the exact /api/internal/revalidate endpoint without credentials, query, or hash.')
  }

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHost(url.hostname))) {
    throw new Error('PORTFOLIO_REVALIDATION_URL must use HTTPS outside loopback development.')
  }

  return { secret, url: url.toString() }
}

export const isProductionRuntime = (environment: Environment = process.env): boolean => environment.NODE_ENV === 'production'
