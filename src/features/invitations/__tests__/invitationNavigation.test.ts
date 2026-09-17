import type { StorageAdapter } from '@/data/contracts';

import { readPendingInviteDestination } from '../invitationNavigation';
import { savePendingInvite } from '../pendingInvite';

function createStorage(): StorageAdapter {
  const values = new Map<string, string>();
  return {
    getItem: async (key) => values.get(key) ?? null,
    removeItem: async (key) => {
      values.delete(key);
    },
    setItem: async (key, value) => {
      values.set(key, value);
    },
  };
}

describe('invitation navigation', () => {
  it('restores the dynamic invitation route after authentication or onboarding', async () => {
    const storage = createStorage();
    await savePendingInvite(storage, 'kin123');

    await expect(readPendingInviteDestination(storage)).resolves.toEqual({
      params: { code: 'KIN123' },
      pathname: '/invite/[code]',
    });
  });

  it('returns no destination when there is no pending invitation', async () => {
    await expect(readPendingInviteDestination(createStorage())).resolves.toBeNull();
  });
});
