export const isAuthenticated = ({ req: { user } }: { req: { user?: unknown } }): boolean => Boolean(user)

/**
 * Public requests are constrained at the database query level. Payload merges
 * this condition with caller-supplied filters, so query params, depth, and
 * direct document lookups cannot bypass the published-only boundary.
 */
export const publishedOrAuthenticated = ({ req: { user } }: { req: { user?: unknown } }) => {
  if (user) {
    return true
  }

  return {
    _status: {
      equals: 'published',
    },
  }
}
