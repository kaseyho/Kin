module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/e2e/',
    '/e2e-connected/',
    '/supabase/functions/',
    '/scripts/process-account-deletion-request.test.ts',
  ],
};
