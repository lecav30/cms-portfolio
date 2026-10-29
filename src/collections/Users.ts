import type { CollectionConfig } from 'payload'

import { isAuthenticated } from '../access/editorial'

export const usersSlug = 'users'

/**
 * The only account collection in Phase 1. There is deliberately no public
 * registration: the first account is bootstrapped from server-only environment
 * variables, and later accounts can be created only by an authenticated admin.
 */
export const Users: CollectionConfig = {
  slug: usersSlug,
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
