import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';

import type { EntitlementState, KinPlusOffering } from '@/domain/models';
import { BillingError, type PremiumService } from './contracts';

export const KIN_PLUS_ENTITLEMENT_ID = 'kin_plus';
let configuredKey: string | null = null;

export function createRevenueCatPremiumService(apiKey: string): PremiumService {
  if (configuredKey !== apiKey) {
    Purchases.configure({ apiKey });
    configuredKey = apiKey;
  }
  const packages = new Map<string, PurchasesPackage>();

  async function getOffering(): Promise<KinPlusOffering | null> {
    try {
      const current = (await Purchases.getOfferings()).current;
      if (!current) return null;
      packages.clear();
      for (const item of current.availablePackages) packages.set(item.identifier, item);
      return {
        id: current.identifier,
        packages: current.availablePackages.map((item) => ({
          id: item.identifier,
          priceLabel: item.product.priceString,
          title: item.product.title || packageTitle(item.identifier),
        })),
      };
    } catch (reason) {
      throw mapBillingError(reason, 'purchase_failed', 'Kin could not load purchase options.');
    }
  }

  return {
    getEntitlement: async () => entitlementFrom(await Purchases.getCustomerInfo()),
    subscribe(listener) {
      const revenueCatListener = (info: CustomerInfo) => listener(entitlementFrom(info));
      Purchases.addCustomerInfoUpdateListener(revenueCatListener);
      return () => { Purchases.removeCustomerInfoUpdateListener(revenueCatListener); };
    },
    getOffering,
    purchase: async (packageId) => {
      let selected = packages.get(packageId);
      if (!selected) {
        await getOffering();
        selected = packages.get(packageId);
      }
      if (!selected) throw new BillingError('purchase_failed', 'That Kin+ option is no longer available.');
      try {
        const result = await Purchases.purchasePackage(selected);
        return entitlementFrom(result.customerInfo);
      } catch (reason) {
        throw mapBillingError(reason, 'purchase_failed', 'Kin could not finish that purchase.');
      }
    },
    restore: async () => {
      try {
        return entitlementFrom(await Purchases.restorePurchases());
      } catch (reason) {
        throw mapBillingError(reason, 'restore_failed', 'Kin could not restore purchases.');
      }
    },
  };
}

function entitlementFrom(customerInfo: CustomerInfo): EntitlementState {
  const active = customerInfo.entitlements.active[KIN_PLUS_ENTITLEMENT_ID];
  return {
    isKinPlus: Boolean(active),
    source: 'revenuecat',
    ...(active?.expirationDate ? { expiresAt: active.expirationDate } : {}),
  };
}

function packageTitle(identifier: string): string {
  if (identifier.toLowerCase().includes('annual')) return 'Annual';
  if (identifier.toLowerCase().includes('month')) return 'Monthly';
  return 'Kin+';
}

function mapBillingError(
  reason: unknown,
  fallbackCode: 'purchase_failed' | 'restore_failed',
  fallbackMessage: string,
): BillingError {
  const candidate = reason as { code?: string; message?: string; userCancelled?: boolean | null };
  if (
    candidate?.userCancelled === true ||
    candidate?.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  ) {
    return new BillingError('cancelled', 'Purchase cancelled.');
  }
  return new BillingError(fallbackCode, candidate?.message || fallbackMessage);
}
