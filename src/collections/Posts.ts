import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { isAuthenticated, publishedOrAuthenticated } from '../access/editorial'
import { slugField } from '../fields/slug'
import { categoriesSlug } from './Categories'
import { mediaSlug } from './Media'
import { tagsSlug } from './Tags'

export const postsSlug = 'posts'

const preservePublishedAt: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const existingPublishedAt = (originalDoc as { publishedAt?: string } | undefined)?.publishedAt
  const status = (data as { _status?: string })._status

  if (existingPublishedAt) {
    return {
      ...data,
      publishedAt: existingPublishedAt,
    }
  }

  if (status === 'published' && !(data as { publishedAt?: string }).publishedAt) {
    return {
      ...data,
      publishedAt: new Date().toISOString(),
    }
  }

  return data
}

const validateCanonicalURL = (value: unknown): string | true => {
  if (!value) {
    return true
  }

  if (typeof value !== 'string') {
    return 'La URL canónica debe ser una URL HTTPS absoluta.'
  }

  try {
    return new URL(value).protocol === 'https:'
      ? true
      : 'La URL canónica debe usar HTTPS.'
  } catch {
    return 'La URL canónica debe ser una URL HTTPS absoluta.'
  }
}

export const Posts: CollectionConfig = {
  slug: postsSlug,
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', '_status', 'publishedAt', 'updatedAt'],
  },
  timestamps: true,
  versions: {
    drafts: {
      autosave: true,
    },
    maxPerDoc: 50,
  },
  access: {
    admin: isAuthenticated,
    create: isAuthenticated,
    read: publishedOrAuthenticated,
    readVersions: isAuthenticated,
    update: isAuthenticated,
    delete: isAuthenticated,
  },
  hooks: {
    beforeChange: [preservePublishedAt],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      maxLength: 160,
    },
    slugField('title'),
    {
      name: 'excerpt',
      type: 'textarea',
      maxLength: 300,
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
    },
    {
      name: 'coverImage',
      type: 'relationship',
      relationTo: mediaSlug,
      admin: {
        description: 'Opcional. Los archivos de Media son solo almacenamiento local hasta la Fase 3.',
      },
    },
    {
      name: 'category',
      type: 'relationship',
      relationTo: categoriesSlug,
      required: true,
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: tagsSlug,
      hasMany: true,
    },
    {
      name: 'contentType',
      type: 'select',
      required: true,
      defaultValue: 'article',
      options: [
        { label: 'Tutorial', value: 'tutorial' },
        { label: 'Review', value: 'review' },
        { label: 'Opinión', value: 'opinion' },
        { label: 'Noticias', value: 'news' },
        { label: 'Artículo', value: 'article' },
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        readOnly: true,
        description: 'Se fija al publicar por primera vez y se conserva al despublicar.',
      },
    },
    {
      type: 'collapsible',
      label: 'SEO',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'seoTitle',
          type: 'text',
          maxLength: 60,
        },
        {
          name: 'seoDescription',
          type: 'textarea',
          maxLength: 160,
        },
        {
          name: 'canonicalUrl',
          type: 'text',
          validate: validateCanonicalURL,
        },
        {
          name: 'noIndex',
          type: 'checkbox',
          defaultValue: false,
        },
      ],
    },
  ],
}
