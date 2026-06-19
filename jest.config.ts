/**
 * Jest configuration for Evolution API test suite.
 * Uses ts-jest to handle TypeScript files and moduleNameMapper
 * to resolve path aliases defined in tsconfig.json.
 */

import type { Config } from 'jest';

const config: Config = {
  // Use ts-jest preset for TypeScript support
  preset: 'ts-jest',

  // Node environment (no DOM needed for API tests)
  testEnvironment: 'node',

  // Automatically clear mock calls and instances before every test
  clearMocks: true,

  // Collect coverage information
  collectCoverage: true,

  // Coverage output directory
  coverageDirectory: 'coverage',

  // Coverage provider
  coverageProvider: 'v8',

  // Only collect coverage from source files (not test files or node_modules)
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/main.ts',
  ],

  // Map TypeScript path aliases to actual paths (mirrors tsconfig.json paths)
  moduleNameMapper: {
    '^@api/(.*)$': '<rootDir>/src/api/$1',
    '^@cache/(.*)$': '<rootDir>/src/cache/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@exceptions$': '<rootDir>/src/exceptions',
    '^@libs/(.*)$': '<rootDir>/src/libs/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@validate/(.*)$': '<rootDir>/src/validate/$1',
  },

  // ts-jest configuration
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          // Relax strict mode for tests
          strict: false,
          strictNullChecks: false,
          esModuleInterop: true,
          // Point rootDir to project root so test files are included
          rootDir: './',
        },
      },
    ],
  },

  // Test file patterns
  testMatch: ['**/test/**/*.test.ts', '**/*.test.ts'],

  // Directories to ignore
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],

  // Verbose output
  verbose: true,
};

export default config;
