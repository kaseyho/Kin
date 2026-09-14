import type { StorageAdapter, KinRepository } from '@/data/contracts';
import type { PremiumService } from '@/services/billing/contracts';

import { createAppRuntime } from '../createAppRuntime';

jest.mock('@/services/billing', () => ({
  createPremiumService: jest.fn(),
}));

const storage: StorageAdapter = {
  getItem: async () => null,
  removeItem: async () => undefined,
  setItem: async () => undefined,
};

const repository = {} as KinRepository;
const premiumService = {} as PremiumService;

describe('createAppRuntime', () => {
  it('turns invalid configuration into a renderable result', () => {
    const runtime = createAppRuntime(storage, {});

    expect(runtime.status).toBe('configuration-error');
    if (runtime.status === 'configuration-error') {
      expect(runtime.error.message).toContain('EXPO_PUBLIC_KIN_ENVIRONMENT');
    }
  });

  it('assembles demo services only for the demo deployment', () => {
    const runtime = createAppRuntime(
      storage,
      { EXPO_PUBLIC_KIN_ENVIRONMENT: 'demo' },
      {
        createPremiumService: () => premiumService,
        createRepository: () => repository,
      },
    );

    expect(runtime).toEqual({
      environment: { deployment: 'demo', mode: 'demo' },
      premiumService,
      repository,
      status: 'ready',
    });
  });

  it('does not hide unexpected service construction failures', () => {
    expect(() => createAppRuntime(
      storage,
      { EXPO_PUBLIC_KIN_ENVIRONMENT: 'demo' },
      {
        createPremiumService: () => premiumService,
        createRepository: () => { throw new Error('construction failed'); },
      },
    )).toThrow('construction failed');
  });
});
