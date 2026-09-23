import type { StorageAdapter } from '@/data/contracts';
import {
  clearPendingNotification,
  parseNotificationDestination,
  readPendingNotification,
  savePendingNotification,
} from '../pendingNotification';

function createStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set('kin.pending-notification.v1', initial);
  const storage: StorageAdapter = {
    getItem: async (key) => values.get(key) ?? null,
    removeItem: async (key) => { values.delete(key); },
    setItem: async (key, value) => { values.set(key, value); },
  };
  return { storage, values };
}

describe('pending notification handoff', () => {
  it('accepts only a canonical Space destination', () => {
    expect(parseNotificationDestination({
      path: '/space/space-1',
      spaceId: 'space-1',
    })).toEqual({ path: '/space/space-1', spaceId: 'space-1' });

    expect(parseNotificationDestination({ path: '/space/space-1', spaceId: 'space-2' })).toBeNull();
    expect(parseNotificationDestination({ path: '/space/../profile', spaceId: '../profile' })).toBeNull();
    expect(parseNotificationDestination({ path: '/space/space-1?admin=true', spaceId: 'space-1' })).toBeNull();
    expect(parseNotificationDestination(null)).toBeNull();
  });

  it('persists only the versioned Space ID and path, never private push content', async () => {
    const { storage, values } = createStorage();

    await expect(savePendingNotification(storage, {
      body: 'A private message body',
      expoPushToken: 'ExponentPushToken[secret]',
      path: '/space/space-1',
      senderName: 'Jamie',
      spaceId: 'space-1',
    })).resolves.toEqual({ path: '/space/space-1', spaceId: 'space-1' });

    expect(values.get('kin.pending-notification.v1')).toBe(JSON.stringify({
      path: '/space/space-1',
      spaceId: 'space-1',
      version: 1,
    }));
    await expect(readPendingNotification(storage)).resolves.toEqual({
      path: '/space/space-1',
      spaceId: 'space-1',
    });
  });

  it('rejects invalid data without overwriting a valid handoff', async () => {
    const { storage, values } = createStorage(JSON.stringify({
      path: '/space/space-1',
      spaceId: 'space-1',
      version: 1,
    }));

    await expect(savePendingNotification(storage, {
      path: '/profile',
      spaceId: 'space-1',
    })).rejects.toThrow('invalid notification destination');
    expect(values.get('kin.pending-notification.v1')).toContain('space-1');
  });

  it('removes corrupt or obsolete persisted destinations', async () => {
    const { storage, values } = createStorage(JSON.stringify({
      path: '/space/space-1',
      spaceId: 'space-1',
      version: 2,
    }));

    await expect(readPendingNotification(storage)).resolves.toBeNull();
    expect(values.has('kin.pending-notification.v1')).toBe(false);
  });

  it('clears a completed handoff', async () => {
    const { storage, values } = createStorage('{}');

    await clearPendingNotification(storage);

    expect(values.has('kin.pending-notification.v1')).toBe(false);
  });
});
