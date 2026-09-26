import { ErrorCode, type CustomerInfo, type Package, Purchases } from '@revenuecat/purchases-js';
import { Linking } from 'react-native';

import type { EntitlementState, KinPlusOffering } from '@/domain/models';
import { BillingError, type PremiumService } from './contracts';
import { billingPeriodLabel, isHttpsUrl, trialPeriodLabel } from './display';

const KIN_PLUS_ENTITLEMENT_ID = 'kin_plus';
const inactiveEntitlement = (): EntitlementState => ({
  canManageSubscription: false,
  isKinPlus: false,
  source: 'unavailable',
});

export function createRevenueCatPremiumService(apiKey: string): PremiumService {
  let activeUserId: string | null = null;
  let configuredUserId: string | null = null;
  let identityQueue: Promise<void> = Promise.resolve();
  let identityRevision = 0;
  let managementURL: string | null = null;
  let purchases: Purchases | null = null;
  let readyUserId: string | null = null;
  let state = inactiveEntitlement();
  const listeners = new Set<(next: EntitlementState) => void>();
  const packages = new Map<string, Package>();

  function publish(next: EntitlementState): EntitlementState {
    state = next;
    for (const listener of listeners) listener({ ...next });
    return { ...next };
  }

  function clearLocalState(notify: boolean) {
    managementURL = null;
    packages.clear();
    readyUserId = null;
    const next = inactiveEntitlement();
    if (notify) publish(next);
    else state = next;
  }

  function queueIdentity<T>(operation: () => Promise<T>): Promise<T> {
    const pending = identityQueue.then(operation, operation);
    identityQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  function ensureActiveIdentity(): { sdk: Purchases; userId: string } {
    if (!activeUserId || readyUserId !== activeUserId || !purchases) {
      throw new BillingError('unavailable', 'Sign in to use Kin+.');
    }
    return { sdk: purchases, userId: activeUserId };
  }

  function assertCurrent(userId: string, revision: number) {
    if (activeUserId !== userId || identityRevision !== revision) {
      throw new BillingError('identity_failed', 'Kin+ could not finish changing accounts.');
    }
  }

  async function activateUser(userId: string): Promise<EntitlementState> {
    const normalized = userId.trim();
    if (!normalized) throw new BillingError('identity_failed', 'Kin+ could not identify this account.');
    const revision = ++identityRevision;
    activeUserId = normalized;
    clearLocalState(true);
    return queueIdentity(async () => {
      assertCurrent(normalized, revision);
      try {
        let info: CustomerInfo;
        if (!purchases) {
          purchases = Purchases.configure({ apiKey, appUserId: normalized });
          configuredUserId = normalized;
          info = await purchases.getCustomerInfo();
        } else if (configuredUserId !== normalized) {
          info = await purchases.changeUser(normalized);
          configuredUserId = normalized;
        } else {
          info = await purchases.getCustomerInfo();
        }
        assertCurrent(normalized, revision);
        readyUserId = normalized;
        managementURL = info.managementURL;
        return publish(entitlementFrom(info));
      } catch (reason) {
        if (reason instanceof BillingError) throw reason;
        throw new BillingError('identity_failed', 'Kin+ could not connect to this account.');
      }
    });
  }

  async function deactivateUser(): Promise<void> {
    activeUserId = null;
    identityRevision += 1;
    clearLocalState(true);
    await identityQueue;
  }

  async function getEntitlement(): Promise<EntitlementState> {
    if (!activeUserId || readyUserId !== activeUserId || !purchases) return { ...state };
    const userId = activeUserId;
    try {
      const info = await purchases.getCustomerInfo();
      if (activeUserId !== userId || readyUserId !== userId) return { ...state };
      managementURL = info.managementURL;
      return publish(entitlementFrom(info));
    } catch {
      throw new BillingError('unavailable', 'Kin could not refresh Kin+ status.');
    }
  }

  async function getOffering(): Promise<KinPlusOffering | null> {
    if (!activeUserId) return null;
    const { sdk } = ensureActiveIdentity();
    try {
      const current = (await sdk.getOfferings()).current;
      if (!current) {
        packages.clear();
        return null;
      }
      packages.clear();
      for (const item of current.availablePackages) packages.set(item.identifier, item);
      return {
        id: current.identifier,
        packages: current.availablePackages.map((item) => {
          const product = item.webBillingProduct;
          const billingLabel = billingPeriodLabel(product.normalPeriodDuration);
          const trialLabel = trialPeriodLabel(product.freeTrialPhase?.periodDuration);
          return {
            id: item.identifier,
            priceLabel: product.price.formattedPrice,
            title: product.title?.trim() || 'Kin+',
            ...(billingLabel ? { billingPeriodLabel: billingLabel } : {}),
            ...(trialLabel ? { trialLabel } : {}),
          };
        }),
      };
    } catch {
      throw new BillingError('offering_failed', 'Kin could not load purchase options.');
    }
  }

  async function purchase(packageId: string): Promise<EntitlementState> {
    const { sdk, userId } = ensureActiveIdentity();
    let selected = packages.get(packageId);
    if (!selected) {
      await getOffering();
      selected = packages.get(packageId);
    }
    if (!selected) throw new BillingError('purchase_failed', 'That Kin+ option is no longer available.');
    try {
      const result = await sdk.purchase({ rcPackage: selected });
      if (activeUserId !== userId || readyUserId !== userId) {
        throw new BillingError('identity_failed', 'Kin+ could not finish changing accounts.');
      }
      managementURL = result.customerInfo.managementURL;
      return publish(entitlementFrom(result.customerInfo));
    } catch (reason) {
      if (reason instanceof BillingError) throw reason;
      if ((reason as { errorCode?: ErrorCode })?.errorCode === ErrorCode.UserCancelledError) {
        throw new BillingError('cancelled', 'Purchase cancelled.');
      }
      throw new BillingError('purchase_failed', 'Kin could not finish that purchase.');
    }
  }

  async function restore(): Promise<EntitlementState> {
    const { sdk, userId } = ensureActiveIdentity();
    try {
      const info = await sdk.getCustomerInfo();
      if (activeUserId !== userId || readyUserId !== userId) {
        throw new BillingError('identity_failed', 'Kin+ could not finish changing accounts.');
      }
      managementURL = info.managementURL;
      return publish(entitlementFrom(info));
    } catch (reason) {
      if (reason instanceof BillingError) throw reason;
      throw new BillingError('restore_failed', 'Kin could not refresh purchases.');
    }
  }

  async function manageSubscription(): Promise<void> {
    ensureActiveIdentity();
    if (!isHttpsUrl(managementURL)) {
      throw new BillingError('management_failed', 'Kin could not open subscription management.');
    }
    try {
      await Linking.openURL(managementURL);
    } catch {
      throw new BillingError('management_failed', 'Kin could not open subscription management.');
    }
  }

  return {
    activateUser,
    deactivateUser,
    getEntitlement,
    getOffering,
    manageSubscription,
    purchase,
    restore,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function entitlementFrom(customerInfo: CustomerInfo): EntitlementState {
  const active = customerInfo.entitlements.active[KIN_PLUS_ENTITLEMENT_ID];
  return {
    canManageSubscription: Boolean(active) && isHttpsUrl(customerInfo.managementURL),
    isKinPlus: Boolean(active),
    source: 'revenuecat',
    ...(active?.expirationDate ? { expiresAt: active.expirationDate.toISOString() } : {}),
  };
}
