import { Linking } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';

import type { EntitlementState, KinPlusOffering } from '@/domain/models';
import { BillingError, type PremiumService } from './contracts';
import { billingPeriodLabel, isHttpsUrl, trialPeriodLabel } from './display';

export const KIN_PLUS_ENTITLEMENT_ID = 'kin_plus';

const inactiveEntitlement = (): EntitlementState => ({
  canManageSubscription: false,
  isKinPlus: false,
  source: 'unavailable',
});

export function createRevenueCatPremiumService(apiKey: string): PremiumService {
  let activeUserId: string | null = null;
  let configured = false;
  let configuredUserId: string | null = null;
  let identityQueue: Promise<void> = Promise.resolve();
  let identityRevision = 0;
  let listenerInstalled = false;
  let managementURL: string | null = null;
  let readyUserId: string | null = null;
  let state = inactiveEntitlement();
  const listeners = new Set<(next: EntitlementState) => void>();
  const packages = new Map<string, PurchasesPackage>();

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

  function ensureActiveIdentity(): string {
    if (!activeUserId || readyUserId !== activeUserId) {
      throw new BillingError('unavailable', 'Sign in to use Kin+.');
    }
    return activeUserId;
  }

  function assertCurrent(userId: string, revision: number) {
    if (activeUserId !== userId || identityRevision !== revision) {
      throw new BillingError('identity_failed', 'Kin+ could not finish changing accounts.');
    }
  }

  function installListener() {
    if (listenerInstalled) return;
    listenerInstalled = true;
    Purchases.addCustomerInfoUpdateListener((info) => {
      const expectedUserId = activeUserId;
      if (!expectedUserId || readyUserId !== expectedUserId) return;
      void Purchases.getAppUserID()
        .then((providerUserId) => {
          if (providerUserId !== expectedUserId || activeUserId !== expectedUserId) return;
          managementURL = info.managementURL;
          publish(entitlementFrom(info));
        })
        .catch(() => undefined);
    });
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
        if (!configured) {
          Purchases.configure({ apiKey, appUserID: normalized });
          configured = true;
          configuredUserId = normalized;
          installListener();
          info = await Purchases.getCustomerInfo();
        } else if (configuredUserId !== normalized) {
          info = (await Purchases.logIn(normalized)).customerInfo;
          configuredUserId = normalized;
        } else {
          info = await Purchases.getCustomerInfo();
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
    const shouldLogOut = configured && Boolean(configuredUserId);
    activeUserId = null;
    identityRevision += 1;
    clearLocalState(true);
    if (!shouldLogOut) return;
    await queueIdentity(async () => {
      try {
        await Purchases.logOut();
        configuredUserId = null;
      } catch {
        // Provider cleanup must never trap the Supabase sign-out path.
      }
    });
  }

  async function getEntitlement(): Promise<EntitlementState> {
    const userId = activeUserId;
    if (!userId || readyUserId !== userId) return { ...state };
    try {
      const info = await Purchases.getCustomerInfo();
      if (activeUserId !== userId || readyUserId !== userId) return { ...state };
      managementURL = info.managementURL;
      return publish(entitlementFrom(info));
    } catch {
      throw new BillingError('unavailable', 'Kin could not refresh Kin+ status.');
    }
  }

  async function getOffering(): Promise<KinPlusOffering | null> {
    if (!activeUserId) return null;
    ensureActiveIdentity();
    try {
      const current = (await Purchases.getOfferings()).current;
      if (!current) {
        packages.clear();
        return null;
      }
      packages.clear();
      for (const item of current.availablePackages) packages.set(item.identifier, item);
      return {
        id: current.identifier,
        packages: current.availablePackages.map((item) => {
          const billingLabel = billingPeriodLabel(item.product.subscriptionPeriod);
          const trialPeriod = item.product.defaultOption?.freePhase?.billingPeriod.iso8601
            ?? (item.product.introPrice?.price === 0 ? item.product.introPrice.period : null);
          const trialLabel = trialPeriodLabel(trialPeriod);
          return {
            id: item.identifier,
            priceLabel: item.product.priceString,
            title: item.product.title?.trim() || 'Kin+',
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
    const userId = ensureActiveIdentity();
    let selected = packages.get(packageId);
    if (!selected) {
      await getOffering();
      selected = packages.get(packageId);
    }
    if (!selected) throw new BillingError('purchase_failed', 'That Kin+ option is no longer available.');
    try {
      const result = await Purchases.purchasePackage(selected);
      if (activeUserId !== userId || readyUserId !== userId) {
        throw new BillingError('identity_failed', 'Kin+ could not finish changing accounts.');
      }
      managementURL = result.customerInfo.managementURL;
      return publish(entitlementFrom(result.customerInfo));
    } catch (reason) {
      if (reason instanceof BillingError) throw reason;
      const candidate = reason as { code?: string; userCancelled?: boolean | null };
      if (
        candidate?.userCancelled === true
        || candidate?.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
      ) {
        throw new BillingError('cancelled', 'Purchase cancelled.');
      }
      throw new BillingError('purchase_failed', 'Kin could not finish that purchase.');
    }
  }

  async function restore(): Promise<EntitlementState> {
    const userId = ensureActiveIdentity();
    try {
      const info = await Purchases.restorePurchases();
      if (activeUserId !== userId || readyUserId !== userId) {
        throw new BillingError('identity_failed', 'Kin+ could not finish changing accounts.');
      }
      managementURL = info.managementURL;
      return publish(entitlementFrom(info));
    } catch (reason) {
      if (reason instanceof BillingError) throw reason;
      throw new BillingError('restore_failed', 'Kin could not restore purchases.');
    }
  }

  async function manageSubscription(): Promise<void> {
    ensureActiveIdentity();
    if (managementURL && !isHttpsUrl(managementURL)) {
      throw new BillingError('management_failed', 'Kin could not open subscription management.');
    }
    try {
      if (managementURL) await Linking.openURL(managementURL);
      else await RevenueCatUI.presentCustomerCenter();
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
    canManageSubscription: Boolean(active) && (!customerInfo.managementURL || isHttpsUrl(customerInfo.managementURL)),
    isKinPlus: Boolean(active),
    source: 'revenuecat',
    ...(active?.expirationDate ? { expiresAt: active.expirationDate } : {}),
  };
}
