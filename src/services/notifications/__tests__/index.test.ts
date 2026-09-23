import type { StorageAdapter } from '@/data/contracts';
import { createNotificationService } from '../index';

const storage: StorageAdapter = {
  getItem: async () => null,
  removeItem: async () => undefined,
  setItem: async () => undefined,
};

describe('createNotificationService', () => {
  it('keeps the demo truthful and never asks for native permission', async () => {
    const service = createNotificationService({ deployment: 'demo', platform: 'ios', storage });

    await expect(service.load()).resolves.toMatchObject({
      installationRegistered: false,
      status: 'unavailable',
    });
    await expect(service.requestPermissionAndRegister()).resolves.toMatchObject({
      installationRegistered: false,
      status: 'unavailable',
    });
  });

  it('reports that push belongs in the native app on web', async () => {
    const service = createNotificationService({ deployment: 'production', platform: 'web', storage });

    await expect(service.load()).resolves.toMatchObject({
      message: expect.stringContaining('iOS and Android'),
      status: 'unavailable',
    });
  });
});
