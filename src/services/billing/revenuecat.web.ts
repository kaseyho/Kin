import type { EntitlementState } from '@/domain/models';
import { BillingError, type PremiumService } from './contracts';

const unavailable: EntitlementState = { isKinPlus: false, source: 'unavailable' };

export function createRevenueCatPremiumService(_apiKey: string): PremiumService {
  return {
    getEntitlement: async () => unavailable,
    subscribe: () => () => undefined,
    getOffering: async () => null,
    purchase: async () => {
      throw new BillingError('unavailable', 'Purchases are unavailable in this browser build.');
    },
    restore: async () => unavailable,
  };
}
