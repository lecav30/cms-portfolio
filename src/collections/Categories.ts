import type { CollectionConfig } from 'payload'

import { isAuthenticated } from '../access/editorial'
import { slugField } from '../fields/slug'

export const categoriesSlug = 'categories'

export const Categories: CollectionConfig = {
  slug: categoriesSlug,
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
      maxLength: 100,
    },
    slugField('name'),
    {
      name: 'description',
      type: 'textarea',
      maxLength: 300,
    },
  ],
}
