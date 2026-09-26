import { Platform } from 'react-native';

import {
  type KinDeployment,
  readPublicEnvironmentValues,
  readRevenueCatPublicKey,
} from '@/config/environment';
import type { StorageAdapter } from '@/data/contracts';
import { BillingError, type PremiumService } from './contracts';
import { createDemoPremiumService } from './demo';
import { createRevenueCatPremiumService } from './revenuecat';

interface PremiumServiceOptions {
  deployment: KinDeployment;
  platform?: typeof Platform.OS;
  storage?: StorageAdapter;
  values?: Record<string, string | undefined>;
}

interface PremiumServiceFactories {
  createRevenueCat: (apiKey: string) => PremiumService;
}

const defaultFactories: PremiumServiceFactories = {
  createRevenueCat: createRevenueCatPremiumService,
};

export function createPremiumService(
  {
    deployment,
    platform = Platform.OS,
    storage,
    values = readPublicEnvironmentValues(),
  }: PremiumServiceOptions,
  factories: PremiumServiceFactories = defaultFactories,
): PremiumService {
  if (deployment === 'demo') return createDemoPremiumService(false, storage);

  const apiKey = readRevenueCatPublicKey(values, deployment, platform);

  if (apiKey) return factories.createRevenueCat(apiKey);
  return createUnavailablePremiumService();
}

function createUnavailablePremiumService(): PremiumService {
  const entitlement = { isKinPlus: false, source: 'unavailable' } as const;
  return {
    activateUser: async () => entitlement,
    deactivateUser: async () => undefined,
    getEntitlement: async () => entitlement,
    subscribe: () => () => undefined,
    getOffering: async () => null,
    manageSubscription: async () => {
      throw new BillingError('unavailable', 'Kin+ subscription management is not configured for this build.');
    },
    purchase: async () => {
      throw new BillingError('unavailable', 'Kin+ purchases are not configured for this build.');
    },
    restore: async () => entitlement,
  };
}
