import type { TextField } from 'payload'

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Produces a stable, URL-safe slug for Spanish and Latin-script input. It does
 * not add suffixes: a collision is a validation/database error that an editor
 * must resolve intentionally.
 */
export const normalizeSlug = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const isValidSlug = (value: string): boolean => slugPattern.test(value) && value === normalizeSlug(value)

export const slugField = (sourceField: 'name' | 'title'): TextField => ({
  name: 'slug',
  type: 'text',
  required: true,
  unique: true,
  index: true,
  admin: {
    description:
      'URL permanente. Si se modifica, el sitio público deberá redirigir la URL anterior en una fase posterior.',
  },
  hooks: {
    beforeValidate: [({ data, value }) => {
      const candidate =
        typeof value === 'string' && value.trim().length > 0
          ? value
          : (data as Record<string, unknown> | undefined)?.[sourceField]

      return typeof candidate === 'string' ? normalizeSlug(candidate) : candidate
    }],
  },
  validate: (value) => {
    if (typeof value !== 'string' || !isValidSlug(value)) {
      return 'El slug debe usar minúsculas, números y guiones simples.'
    }

    return true
  },
})
