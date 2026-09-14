import type { StorageAdapter } from '@/data/contracts';
import type { PremiumService } from '../contracts';
import { createDemoPremiumService } from '../demo';
import { createPremiumService } from '../index';

jest.mock('../revenuecat', () => ({
  createRevenueCatPremiumService: jest.fn(),
}));

function memoryStorage(): StorageAdapter {
  let value: string | null = null;
  return {
    getItem: async () => value,
    setItem: async (_key, next) => { value = next; },
    removeItem: async () => { value = null; },
  };
}

it('labels, publishes, and separately persists a demo Kin+ entitlement', async () => {
  const storage = memoryStorage();
  const service = createDemoPremiumService(false, storage);
  const listener = jest.fn();
  service.subscribe(listener);

  expect(await service.getEntitlement()).toEqual({ isKinPlus: false, source: 'demo' });
  expect((await service.getOffering())?.packages[0]).toMatchObject({
    id: 'demo-kin-plus',
    priceLabel: 'Free in demo',
  });
  await service.purchase('demo-kin-plus');
  expect(listener).toHaveBeenCalledWith({ isKinPlus: true, source: 'demo' });

  const reloaded = createDemoPremiumService(false, storage);
  expect(await reloaded.getEntitlement()).toEqual({ isKinPlus: true, source: 'demo' });
});

it('creates a demo entitlement only for the explicit demo deployment', async () => {
  const service = createPremiumService({
    deployment: 'demo',
    storage: memoryStorage(),
  });

  expect(await service.getEntitlement()).toEqual({ isKinPlus: false, source: 'demo' });
  expect((await service.getOffering())?.packages[0].id).toBe('demo-kin-plus');
});

it('keeps connected billing unavailable instead of granting a demo entitlement', async () => {
  const service = createPremiumService({
    deployment: 'development',
    platform: 'ios',
    storage: memoryStorage(),
    values: {},
  });

  expect(await service.getEntitlement()).toEqual({ isKinPlus: false, source: 'unavailable' });
  expect(await service.getOffering()).toBeNull();
  await expect(service.purchase('monthly')).rejects.toMatchObject({ code: 'unavailable' });
});

it('fails closed when production billing lacks its platform key', () => {
  expect(() => createPremiumService({
    deployment: 'production',
    platform: 'web',
    values: {},
  })).toThrow('RevenueCat web public key');
});

it('uses the configured public key for the current connected platform', () => {
  const revenueCat = {} as PremiumService;
  const service = createPremiumService(
    {
      deployment: 'production',
      platform: 'ios',
      values: { EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: 'appl_public' },
    },
    { createRevenueCat: () => revenueCat },
  );

  expect(service).toBe(revenueCat);
});
