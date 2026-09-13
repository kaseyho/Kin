import type { StorageAdapter } from '@/data/contracts';
import { createDemoPremiumService } from '../demo';

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
