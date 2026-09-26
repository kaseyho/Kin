import type { StorageAdapter } from '@/data/contracts';
import type { EntitlementState, KinPlusOffering } from '@/domain/models';
import { BillingError, type PremiumService } from './contracts';

const DEMO_ENTITLEMENT_KEY = 'kin.demo.entitlement.v1';

export function createDemoPremiumService(
  initial = false,
  storage?: StorageAdapter,
): PremiumService {
  let state: EntitlementState = { isKinPlus: initial, source: 'demo' };
  let loaded = false;
  const listeners = new Set<(next: EntitlementState) => void>();

  async function load(): Promise<EntitlementState> {
    if (!loaded && storage) {
      const stored = await storage.getItem(DEMO_ENTITLEMENT_KEY);
      if (stored === 'active') state = { isKinPlus: true, source: 'demo' };
      if (stored === 'inactive') state = { isKinPlus: false, source: 'demo' };
    }
    loaded = true;
    return { ...state };
  }

  async function commit(active: boolean): Promise<EntitlementState> {
    state = { isKinPlus: active, source: 'demo' };
    loaded = true;
    if (storage) await storage.setItem(DEMO_ENTITLEMENT_KEY, active ? 'active' : 'inactive');
    for (const listener of listeners) listener({ ...state });
    return { ...state };
  }

  const offering: KinPlusOffering = {
    id: 'kin-plus-demo',
    packages: [{ id: 'demo-kin-plus', title: 'Kin+ demo', priceLabel: 'Free in demo' }],
  };

  return {
    activateUser: async () => load(),
    deactivateUser: async () => undefined,
    getEntitlement: load,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getOffering: async () => offering,
    manageSubscription: async () => {
      throw new BillingError('unavailable', 'Subscription management is unavailable in demo mode.');
    },
    purchase: async (packageId) => {
      if (packageId !== 'demo-kin-plus') {
        throw new BillingError('purchase_failed', 'That Kin+ option is not available in this demo.');
      }
      return commit(true);
    },
    restore: load,
  };
}
