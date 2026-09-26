import type { EntitlementState, KinPlusOffering } from '@/domain/models';

export type BillingErrorCode =
  | 'cancelled'
  | 'identity_failed'
  | 'management_failed'
  | 'offering_failed'
  | 'purchase_failed'
  | 'restore_failed'
  | 'unavailable';

export class BillingError extends Error {
  constructor(readonly code: BillingErrorCode, message: string) {
    super(message);
    this.name = 'BillingError';
  }
}

export interface PremiumService {
  activateUser(userId: string): Promise<EntitlementState>;
  deactivateUser(): Promise<void>;
  getEntitlement(): Promise<EntitlementState>;
  subscribe(listener: (state: EntitlementState) => void): () => void;
  getOffering(): Promise<KinPlusOffering | null>;
  manageSubscription(): Promise<void>;
  purchase(packageId: string): Promise<EntitlementState>;
  restore(): Promise<EntitlementState>;
}
