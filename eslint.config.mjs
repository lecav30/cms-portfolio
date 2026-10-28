import nextVitals from 'eslint-config-next/core-web-vitals'

const config = [
  ...nextVitals,
  {
    ignores: ['.next/', 'node_modules/', 'src/payload-types.ts', 'src/payload-generated-schema.ts'],
  },
]

export default config
