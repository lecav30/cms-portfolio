import type { CollectionConfig } from 'payload'

import { isAuthenticated } from '../access/editorial'
import { slugField } from '../fields/slug'

export const tagsSlug = 'tags'

export const Tags: CollectionConfig = {
  slug: tagsSlug,
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'updatedAt'],
  },
  timestamps: true,
  access: {
    admin: isAuthenticated,
    create: isAuthenticated,
    read: () => true,
    update: isAuthenticated,
    delete: isAuthenticated,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      maxLength: 80,
    },
    slugField('name'),
  ],
}
