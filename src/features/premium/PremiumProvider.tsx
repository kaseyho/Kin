import { createContext, type PropsWithChildren, useEffect, useState } from 'react';

import type { EntitlementState, KinPlusOffering } from '@/domain/models';
import { BillingError, type PremiumService } from '@/services/billing/contracts';

export interface PremiumContextValue {
  entitlement: EntitlementState;
  offering: KinPlusOffering | null;
  loading: boolean;
  error: string;
  restoreNotice: string;
  purchase: (packageId: string) => Promise<void>;
  retryPurchase: () => Promise<void>;
  restore: () => Promise<void>;
}

const fallback: PremiumContextValue = {
  entitlement: { isKinPlus: false, source: 'unavailable' },
  offering: null,
  loading: false,
  error: '',
  restoreNotice: '',
  purchase: async () => undefined,
  retryPurchase: async () => undefined,
  restore: async () => undefined,
};

export const PremiumContext = createContext<PremiumContextValue>(fallback);

export function PremiumProvider({ children, service }: PropsWithChildren<{ service: PremiumService }>) {
  const [entitlement, setEntitlement] = useState<EntitlementState>({ isKinPlus: false, source: 'unavailable' });
  const [offering, setOffering] = useState<KinPlusOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoreNotice, setRestoreNotice] = useState('');
  const [lastPackageId, setLastPackageId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = service.subscribe((next) => {
      if (active) setEntitlement(next);
    });
    void Promise.all([service.getEntitlement(), service.getOffering()])
      .then(([nextEntitlement, nextOffering]) => {
        if (!active) return;
        setEntitlement(nextEntitlement);
        setOffering(nextOffering);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Kin+ is unavailable.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [service]);

  async function purchase(packageId: string) {
    setLastPackageId(packageId);
    setError('');
    setRestoreNotice('');
    try {
      setEntitlement(await service.purchase(packageId));
    } catch (reason) {
      if (reason instanceof BillingError && reason.code === 'cancelled') return;
      setError(reason instanceof Error ? reason.message : 'Kin could not finish that purchase.');
    }
  }

  async function restore() {
    setError('');
    setRestoreNotice('');
    try {
      const restored = await service.restore();
      setEntitlement(restored);
      setRestoreNotice(restored.isKinPlus ? 'Kin+ restored.' : 'No active Kin+ purchase found.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kin could not restore purchases.');
    }
  }

  const value: PremiumContextValue = {
    entitlement,
    error,
    loading,
    offering,
    purchase,
    restore,
    restoreNotice,
    retryPurchase: async () => {
      if (lastPackageId) await purchase(lastPackageId);
    },
  };

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}
