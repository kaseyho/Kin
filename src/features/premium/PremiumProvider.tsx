import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { KinDeployment } from '@/config/environment';
import type { EntitlementState, KinPlusOffering } from '@/domain/models';
import type { AuthState } from '@/services/auth/contracts';
import { BillingError, type PremiumService } from '@/services/billing/contracts';

type PremiumSessionStatus = 'waiting' | 'inactive' | 'activating' | 'active' | 'error';
type PremiumTransaction = 'idle' | 'purchase' | 'restore' | 'manage';

export interface PremiumContextValue {
  deployment: KinDeployment;
  entitlement: EntitlementState;
  entitlementLoading: boolean;
  identityError: string;
  managementError: string;
  offering: KinPlusOffering | null;
  offeringError: string;
  offeringLoading: boolean;
  purchaseError: string;
  restoreError: string;
  restoreNotice: string;
  sessionStatus: PremiumSessionStatus;
  transaction: PremiumTransaction;
  manage: () => Promise<void>;
  purchase: (packageId: string) => Promise<void>;
  restore: () => Promise<void>;
  retryActivation: () => Promise<void>;
  retryOffering: () => Promise<void>;
  retryPurchase: () => Promise<void>;
}

const inactiveEntitlement = (): EntitlementState => ({
  canManageSubscription: false,
  isKinPlus: false,
  source: 'unavailable',
});

const fallback: PremiumContextValue = {
  deployment: 'development',
  entitlement: inactiveEntitlement(),
  entitlementLoading: false,
  identityError: '',
  managementError: '',
  offering: null,
  offeringError: '',
  offeringLoading: false,
  purchaseError: '',
  restoreError: '',
  restoreNotice: '',
  sessionStatus: 'inactive',
  transaction: 'idle',
  manage: async () => undefined,
  purchase: async () => undefined,
  restore: async () => undefined,
  retryActivation: async () => undefined,
  retryOffering: async () => undefined,
  retryPurchase: async () => undefined,
};

export const PremiumContext = createContext<PremiumContextValue>(fallback);

interface PremiumProviderProps extends PropsWithChildren {
  authState: AuthState;
  deployment: KinDeployment;
  service: PremiumService;
}

export function PremiumProvider({
  authState,
  children,
  deployment,
  service,
}: PremiumProviderProps) {
  const [entitlement, setEntitlement] = useState<EntitlementState>(inactiveEntitlement);
  const [entitlementLoading, setEntitlementLoading] = useState(authState.status === 'loading');
  const [identityError, setIdentityError] = useState('');
  const [managementError, setManagementError] = useState('');
  const [offering, setOffering] = useState<KinPlusOffering | null>(null);
  const [offeringError, setOfferingError] = useState('');
  const [offeringLoading, setOfferingLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [restoreNotice, setRestoreNotice] = useState('');
  const [resolvedIdentity, setResolvedIdentity] = useState<string | null>(null);
  const [errorIdentity, setErrorIdentity] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<PremiumSessionStatus>(
    authState.status === 'loading' ? 'waiting' : 'inactive',
  );
  const [transaction, setTransaction] = useState<PremiumTransaction>('idle');
  const activeIdentity = useRef<string | null>(null);
  const lastPackageId = useRef<string | null>(null);
  const operationRevision = useRef(0);
  const transactionRef = useRef<PremiumTransaction>('idle');
  const authIdentity = authState.status === 'demo'
    ? 'demo'
    : authState.status === 'signed-in' ? authState.user.id : null;

  const loadOffering = useCallback(async (revision = operationRevision.current) => {
    if (!activeIdentity.current || revision !== operationRevision.current) return;
    setOfferingLoading(true);
    setOfferingError('');
    try {
      const next = await service.getOffering();
      if (revision !== operationRevision.current || !activeIdentity.current) return;
      setOffering(next);
    } catch (reason) {
      if (revision !== operationRevision.current || !activeIdentity.current) return;
      setOffering(null);
      setOfferingError(messageFrom(reason, 'Kin could not load purchase options.'));
    } finally {
      if (revision === operationRevision.current && activeIdentity.current) {
        setOfferingLoading(false);
      }
    }
  }, [service]);

  const activate = useCallback(async (identity: string) => {
    const revision = ++operationRevision.current;
    activeIdentity.current = identity;
    transactionRef.current = 'idle';
    await Promise.resolve();
    if (revision !== operationRevision.current || activeIdentity.current !== identity) return;
    setEntitlement(inactiveEntitlement());
    setEntitlementLoading(true);
    setIdentityError('');
    setManagementError('');
    setOffering(null);
    setOfferingError('');
    setOfferingLoading(false);
    setPurchaseError('');
    setRestoreError('');
    setRestoreNotice('');
    setResolvedIdentity(null);
    setErrorIdentity(null);
    setSessionStatus('activating');
    setTransaction('idle');
    try {
      const next = await service.activateUser(identity);
      if (revision !== operationRevision.current || activeIdentity.current !== identity) return;
      setEntitlement(next);
      setEntitlementLoading(false);
      setResolvedIdentity(identity);
      setSessionStatus('active');
      await loadOffering(revision);
    } catch (reason) {
      if (revision !== operationRevision.current || activeIdentity.current !== identity) return;
      setEntitlementLoading(false);
      setIdentityError(messageFrom(reason, 'Kin+ could not connect to this account.'));
      setErrorIdentity(identity);
      setSessionStatus('error');
    }
  }, [loadOffering, service]);

  useEffect(() => {
    if (authState.status === 'loading') {
      operationRevision.current += 1;
      activeIdentity.current = null;
      transactionRef.current = 'idle';
      return;
    }
    if (authState.status === 'signed-out') {
      operationRevision.current += 1;
      activeIdentity.current = null;
      transactionRef.current = 'idle';
      void service.deactivateUser().catch(() => undefined);
      return;
    }
    if (authIdentity) {
      void Promise.resolve().then(() => activate(authIdentity));
    }
  }, [activate, authIdentity, authState.status, service]);

  useEffect(() => service.subscribe((next) => {
    if (activeIdentity.current) setEntitlement(next);
  }), [service]);

  async function purchase(packageId: string) {
    if (
      transactionRef.current !== 'idle'
      || sessionStatus !== 'active'
      || resolvedIdentity !== activeIdentity.current
    ) return;
    lastPackageId.current = packageId;
    transactionRef.current = 'purchase';
    setTransaction('purchase');
    setPurchaseError('');
    setRestoreNotice('');
    const revision = operationRevision.current;
    try {
      const next = await service.purchase(packageId);
      if (revision === operationRevision.current && activeIdentity.current) setEntitlement(next);
    } catch (reason) {
      if (reason instanceof BillingError && reason.code === 'cancelled') return;
      if (revision === operationRevision.current && activeIdentity.current) {
        setPurchaseError(messageFrom(reason, 'Kin could not finish that purchase.'));
      }
    } finally {
      if (revision === operationRevision.current && activeIdentity.current) {
        transactionRef.current = 'idle';
        setTransaction('idle');
      }
    }
  }

  async function restore() {
    if (
      transactionRef.current !== 'idle'
      || sessionStatus !== 'active'
      || resolvedIdentity !== activeIdentity.current
    ) return;
    transactionRef.current = 'restore';
    setTransaction('restore');
    setRestoreError('');
    setRestoreNotice('');
    const revision = operationRevision.current;
    try {
      const restored = await service.restore();
      if (revision !== operationRevision.current || !activeIdentity.current) return;
      setEntitlement(restored);
      setRestoreNotice(restored.isKinPlus ? 'Kin+ restored.' : 'No active Kin+ purchase found.');
    } catch (reason) {
      if (revision === operationRevision.current && activeIdentity.current) {
        setRestoreError(messageFrom(reason, 'Kin could not restore purchases.'));
      }
    } finally {
      if (revision === operationRevision.current && activeIdentity.current) {
        transactionRef.current = 'idle';
        setTransaction('idle');
      }
    }
  }

  async function manage() {
    if (
      transactionRef.current !== 'idle'
      || sessionStatus !== 'active'
      || resolvedIdentity !== activeIdentity.current
    ) return;
    transactionRef.current = 'manage';
    setTransaction('manage');
    setManagementError('');
    const revision = operationRevision.current;
    try {
      await service.manageSubscription();
    } catch (reason) {
      if (revision === operationRevision.current && activeIdentity.current) {
        setManagementError(messageFrom(reason, 'Kin could not open subscription management.'));
      }
    } finally {
      if (revision === operationRevision.current && activeIdentity.current) {
        transactionRef.current = 'idle';
        setTransaction('idle');
      }
    }
  }

  const identityMatches = Boolean(authIdentity && resolvedIdentity === authIdentity);
  const effectiveSessionStatus: PremiumSessionStatus = authState.status === 'loading'
    ? 'waiting'
    : !authIdentity
      ? 'inactive'
      : errorIdentity === authIdentity && identityError
        ? 'error'
        : identityMatches ? 'active' : 'activating';
  const value: PremiumContextValue = {
    deployment,
    entitlement: identityMatches ? entitlement : inactiveEntitlement(),
    entitlementLoading: effectiveSessionStatus === 'waiting' || effectiveSessionStatus === 'activating'
      ? true
      : entitlementLoading,
    identityError: errorIdentity === authIdentity ? identityError : '',
    managementError: identityMatches ? managementError : '',
    offering: identityMatches ? offering : null,
    offeringError: identityMatches ? offeringError : '',
    offeringLoading: identityMatches ? offeringLoading : false,
    purchaseError: identityMatches ? purchaseError : '',
    restoreError: identityMatches ? restoreError : '',
    restoreNotice: identityMatches ? restoreNotice : '',
    sessionStatus: effectiveSessionStatus,
    transaction: identityMatches ? transaction : 'idle',
    manage,
    purchase,
    restore,
    retryActivation: async () => {
      if (authIdentity) await activate(authIdentity);
    },
    retryOffering: () => loadOffering(),
    retryPurchase: async () => {
      if (lastPackageId.current) await purchase(lastPackageId.current);
    },
  };

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

function messageFrom(reason: unknown, fallbackMessage: string): string {
  return reason instanceof Error ? reason.message : fallbackMessage;
}
