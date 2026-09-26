import type { EnvironmentValues } from './environment';

export function readPlatformRevenueCatPublicEnvironment(): EnvironmentValues {
  return {
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  };
}
