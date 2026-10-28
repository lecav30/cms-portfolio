import type { CollectionConfig } from 'payload'

const isAuthenticated = ({ req: { user } }: { req: { user?: unknown } }): boolean => Boolean(user)

/**
 * The only account collection in Phase 1. There is deliberately no public
 * registration: the first account is bootstrapped from server-only environment
 * variables, and later accounts can be created only by an authenticated admin.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  access: {
    admin: isAuthenticated,
    create: isAuthenticated,
    read: isAuthenticated,
    update: isAuthenticated,
    delete: isAuthenticated,
    unlock: isAuthenticated,
  },
  fields: [],
}
