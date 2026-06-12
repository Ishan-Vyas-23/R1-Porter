'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js', // entry point, not unit testable
  ],
  // Give each test file a generous timeout for DB/supertest calls
  testTimeout: 15000,
  // Run serially to avoid DB state conflicts between test files
  runInBand: true,
};
