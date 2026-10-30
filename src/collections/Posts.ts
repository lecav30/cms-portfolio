import { ValidationError, type CollectionBeforeChangeHook, type CollectionBeforeValidateHook, type CollectionConfig } from 'payload'

import { isAuthenticated, publishedOrAuthenticated } from '../access/editorial'
import { isTechnicalCodeLanguage } from '../blocks/TechnicalContent'
import { slugField } from '../fields/slug'
import { categoriesSlug } from './Categories'
import { mediaSlug } from './Media'
import { tagsSlug } from './Tags'
import {
  capturePublicPostBeforeChange,
  capturePublicPostBeforeDelete,
  queuePublicPostChange,
  queuePublicPostDelete,
} from '../revalidation/posts'

export const postsSlug = 'posts'

type TechnicalNode = {
  children?: unknown
  fields?: unknown
  type?: unknown
}

const technicalNodeErrors = (value: unknown, path: string, errors: Array<{ message: string; path: string }>): void => {
  if (!value || typeof value !== 'object') return

  const node = value as TechnicalNode
  const fields = node.fields && typeof node.fields === 'object' ? (node.fields as Record<string, unknown>) : undefined

  if (node.type === 'block' && fields?.blockType === 'Code') {
    if (!isTechnicalCodeLanguage(fields.language)) {
      errors.push({ message: 'El lenguaje de código no está permitido.', path: `${path}.fields.language` })
    }
    if (typeof fields.code !== 'string' || fields.code.length > 50_000) {
      errors.push({ message: 'El código debe ser texto plano de hasta 50.000 caracteres.', path: `${path}.fields.code` })
    }
  }

  if ((node.type === 'block' && fields?.blockType === 'Math') || (node.type === 'inlineBlock' && fields?.blockType === 'InlineMath')) {
    if (typeof fields.latex !== 'string' || fields.latex.length > 10_000) {
      errors.push({ message: 'La expresión LaTeX debe ser texto de hasta 10.000 caracteres.', path: `${path}.fields.latex` })
    }
  }

  if (Array.isArray(node.children)) {
    node.children.forEach((child, index) => technicalNodeErrors(child, `${path}.children.${index}`, errors))
  }
}

const validateTechnicalContent: CollectionBeforeValidateHook = ({ data, req }) => {
  const content = (data as { content?: unknown }).content
  if (!content || typeof content !== 'object') return data

  const root = (content as { root?: unknown }).root
  const errors: Array<{ message: string; path: string }> = []
  technicalNodeErrors(root, 'content.root', errors)

  if (errors.length > 0) {
    throw new ValidationError({ collection: postsSlug, errors, req })
  }

  return data
}

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
    afterChange: [queuePublicPostChange],
    afterDelete: [queuePublicPostDelete],
    beforeChange: [capturePublicPostBeforeChange, preservePublishedAt],
    beforeDelete: [capturePublicPostBeforeDelete],
    beforeValidate: [validateTechnicalContent],
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
