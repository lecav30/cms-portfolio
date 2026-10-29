import { buildPublicMediaURL, resolveR2Configuration } from '../src/storage/r2'

const r2Names = [
  'R2_ACCESS_KEY_ID',
  'R2_BUCKET',
  'R2_ENABLED',
  'R2_ENDPOINT',
  'R2_PUBLIC_BASE_URL',
  'R2_SECRET_ACCESS_KEY',
] as const

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

const expectError = (operation: () => unknown, expectedMessage: string): void => {
  try {
    operation()
  } catch (error) {
    assert(error instanceof Error && error.message.includes(expectedMessage), 'Unexpected R2 configuration error.')
    return
  }

  throw new Error(`Expected configuration error containing: ${expectedMessage}`)
}

const withEnvironment = (values: Partial<Record<(typeof r2Names)[number] | 'NODE_ENV', string | undefined>>, operation: () => void): void => {
  const names = [...r2Names, 'NODE_ENV'] as const
  const mutableEnvironment = process.env as Record<string, string | undefined>
  const original = new Map(names.map((name) => [name, process.env[name]]))

  try {
    for (const name of names) {
      const value = values[name]

      if (value === undefined) {
        delete mutableEnvironment[name]
      } else {
        mutableEnvironment[name] = value
      }
    }

    operation()
  } finally {
    for (const name of names) {
      const value = original.get(name)

      if (value === undefined) {
        delete mutableEnvironment[name]
      } else {
        mutableEnvironment[name] = value
      }
    }
  }
}

withEnvironment({ NODE_ENV: 'development', R2_ENABLED: 'false' }, () => {
  assert(resolveR2Configuration() === undefined, 'Disabled development R2 should use explicit local storage.')
})

withEnvironment({ NODE_ENV: 'production', R2_ENABLED: 'false' }, () => {
  expectError(resolveR2Configuration, 'R2_ENABLED=true is required in production')
})

withEnvironment({ NODE_ENV: 'development', R2_ENABLED: 'true' }, () => {
  expectError(resolveR2Configuration, 'R2_ENABLED=true requires')
})

withEnvironment(
  {
    NODE_ENV: 'production',
    R2_ACCESS_KEY_ID: 'test-access-key-id',
    R2_BUCKET: 'cms-portfolio-media-test',
    R2_ENABLED: 'true',
    R2_ENDPOINT: 'https://00000000000000000000000000000000.r2.cloudflarestorage.com',
    R2_PUBLIC_BASE_URL: 'https://media.example.test',
    R2_SECRET_ACCESS_KEY: 'test-secret-access-key',
  },
  () => {
    const config = resolveR2Configuration()
    assert(config?.bucket === 'cms-portfolio-media-test', 'Valid R2 configuration was not accepted.')
    assert(
      buildPublicMediaURL({
        filename: '../imagen de prueba.png',
        publicBaseURL: config.publicBaseURL,
      }) === 'https://media.example.test/media/imagen%20de%20prueba.png',
      'Public media URL did not use a safe custom-hostname object key.',
    )
  },
)

console.log('r2_configuration_validation=pass')
