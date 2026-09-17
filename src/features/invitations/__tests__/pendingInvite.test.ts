import type { StorageAdapter } from '@/data/contracts';

import {
  clearPendingInvite,
  readPendingInvite,
  savePendingInvite,
} from '../pendingInvite';

function createStorage(initial: string | null = null) {
  let value = initial;
  const storage: StorageAdapter = {
    getItem: jest.fn(async () => value),
    removeItem: jest.fn(async () => {
      value = null;
    }),
    setItem: jest.fn(async (_key, next) => {
      value = next;
    }),
  };
  return { storage, value: () => value };
}

describe('pending invitation handoff', () => {
  it('stores one normalized invitation code across auth and onboarding', async () => {
    const { storage, value } = createStorage();

    await savePendingInvite(storage, ' kin123 ');

    expect(await readPendingInvite(storage)).toBe('KIN123');
    expect(value()).toContain('KIN123');
  });

  it('replaces an older pending invitation instead of queueing multiple redemptions', async () => {
    const { storage } = createStorage();
    await savePendingInvite(storage, 'KIN123');
    await savePendingInvite(storage, 'NEW456');

    expect(await readPendingInvite(storage)).toBe('NEW456');
  });

  it('retains the code until success or an explicit dismissal clears it', async () => {
    const { storage } = createStorage();
    await savePendingInvite(storage, 'KIN123');

    expect(await readPendingInvite(storage)).toBe('KIN123');
    expect(await readPendingInvite(storage)).toBe('KIN123');

    await clearPendingInvite(storage);
    expect(await readPendingInvite(storage)).toBeNull();
  });

  it('discards corrupt and invalid persisted values safely', async () => {
    const corrupt = createStorage('{not-json');
    expect(await readPendingInvite(corrupt.storage)).toBeNull();
    expect(corrupt.storage.removeItem).toHaveBeenCalled();

    const invalid = createStorage(JSON.stringify({ version: 1, code: '../secret' }));
    expect(await readPendingInvite(invalid.storage)).toBeNull();
    expect(invalid.storage.removeItem).toHaveBeenCalled();
  });

  it('refuses to persist invalid codes', async () => {
    const { storage } = createStorage();
    await expect(savePendingInvite(storage, 'nope')).rejects.toThrow('invitation code');
  });

  it('fails closed when device storage cannot be read or repaired', async () => {
    const removeItem = jest.fn(async () => {
      throw new Error('storage unavailable');
    });
    const storage: StorageAdapter = {
      getItem: async () => {
        throw new Error('storage unavailable');
      },
      removeItem,
      setItem: async () => {
        throw new Error('storage unavailable');
      },
    };

    await expect(readPendingInvite(storage)).resolves.toBeNull();
    expect(removeItem).not.toHaveBeenCalled();
  });
});
