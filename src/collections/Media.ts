import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CollectionConfig } from 'payload'

import { isAuthenticated } from '../access/editorial'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export const mediaSlug = 'media'

/**
 * Local filesystem storage is deliberately temporary. Phase 3 replaces this
 * static directory with the Cloudflare R2 adapter before production use.
 */
export const Media: CollectionConfig = {
  slug: mediaSlug,
  admin: {
    useAsTitle: 'alt',
    defaultColumns: ['alt', 'filename', 'updatedAt'],
  },
  timestamps: true,
  upload: {
    staticDir: path.resolve(dirname, '../../media'),
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'],
    pasteURL: false,
    bulkUpload: false,
  },
  access: {
    admin: isAuthenticated,
    create: isAuthenticated,
    read: () => true,
    update: isAuthenticated,
    delete: isAuthenticated,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      maxLength: 200,
      admin: {
        description: 'Descripción alternativa obligatoria y apta para contenido público.',
      },
    },
  ],
}
