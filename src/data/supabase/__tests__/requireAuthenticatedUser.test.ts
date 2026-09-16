import { requireAuthenticatedUserId } from '../requireAuthenticatedUser';

describe('requireAuthenticatedUserId', () => {
  it('returns the existing authenticated user ID', async () => {
    await expect(requireAuthenticatedUserId({
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    })).resolves.toBe('user-1');
  });

  it('rejects a missing session instead of creating an anonymous user', async () => {
    await expect(requireAuthenticatedUserId({
      getUser: async () => ({ data: { user: null }, error: null }),
    })).rejects.toMatchObject({
      code: 'auth_required',
      message: 'Sign in to use connected Kin.',
      recovery: 'reconnect',
    });
  });

  it('uses the same safe error when session lookup fails', async () => {
    await expect(requireAuthenticatedUserId({
      getUser: async () => ({ data: { user: null }, error: new Error('provider secret') }),
    })).rejects.toMatchObject({
      code: 'auth_required',
      message: 'Sign in to use connected Kin.',
    });
  });
});
