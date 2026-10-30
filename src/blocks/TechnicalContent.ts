import type { Block } from 'payload'

export const technicalCodeLanguages = [
  'text',
  'typescript',
  'javascript',
  'tsx',
  'json',
  'bash',
  'python',
  'sql',
] as const

const languageOptions = [
  { label: 'Texto plano', value: 'text' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'TSX', value: 'tsx' },
  { label: 'JSON', value: 'json' },
  { label: 'Bash', value: 'bash' },
  { label: 'Python', value: 'python' },
  { label: 'SQL', value: 'sql' },
]

export const isTechnicalCodeLanguage = (value: unknown): value is (typeof technicalCodeLanguages)[number] =>
  typeof value === 'string' && technicalCodeLanguages.includes(value as (typeof technicalCodeLanguages)[number])

export const TechnicalCodeBlock: Block = {
  slug: 'Code',
  labels: {
    plural: 'Bloques de código',
    singular: 'Bloque de código',
  },
  fields: [
    {
      name: 'language',
      type: 'select',
      required: true,
      defaultValue: 'text',
      options: languageOptions,
      validate: (value: unknown) => isTechnicalCodeLanguage(value) || 'El lenguaje de código no está permitido.',
    },
    {
      name: 'code',
      type: 'textarea',
      required: true,
      maxLength: 50_000,
      admin: {
        description: 'Texto plano; se preservan saltos de línea y sangría. No se ejecuta ni se interpreta como HTML.',
      },
    },
  ],
}

const latexField = {
  name: 'latex',
  type: 'textarea' as const,
  required: true,
  maxLength: 10_000,
  admin: {
    description:
      'LaTeX sin procesar. La vista previa y renderización segura se incorporarán en el frontend en la Fase 7B.',
  },
}

export const DisplayMathBlock: Block = {
  slug: 'Math',
  labels: {
    plural: 'Fórmulas en bloque',
    singular: 'Fórmula en bloque',
  },
  fields: [latexField],
}

export const InlineMathBlock: Block = {
  slug: 'InlineMath',
  labels: {
    plural: 'Fórmulas en línea',
    singular: 'Fórmula en línea',
  },
  fields: [latexField],
}
