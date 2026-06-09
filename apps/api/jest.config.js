/** Unit test configuration. Integration tests live in test/jest-integration.config.js */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  collectCoverageFrom: ['**/*.ts'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  clearMocks: true,
};
