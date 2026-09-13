import { Platform } from 'react-native';

import type { StorageAdapter } from '@/data/contracts';
import type { PremiumService } from './contracts';
import { createDemoPremiumService } from './demo';
import { createRevenueCatPremiumService } from './revenuecat';

export function createPremiumService(storage?: StorageAdapter): PremiumService {
  const apiKey = Platform.select({
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    default: undefined,
  });
  return apiKey ? createRevenueCatPremiumService(apiKey) : createDemoPremiumService(false, storage);
}
