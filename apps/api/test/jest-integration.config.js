/**
 * Integration tests run against a real PostgreSQL (docker-compose "test"
 * profile) and Redis. Start them with: docker compose --profile test up -d
 */
module.exports = {
  rootDir: '..',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: 'test/.*\\.integration\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/env-setup.ts'],
  globalSetup: '<rootDir>/test/global-setup.js',
  testTimeout: 30000,
};
