import type { EntitlementState, KinPlusOffering } from '@/domain/models';

export type BillingErrorCode = 'cancelled' | 'unavailable' | 'purchase_failed' | 'restore_failed';

export class BillingError extends Error {
  constructor(readonly code: BillingErrorCode, message: string) {
    super(message);
    this.name = 'BillingError';
  }
}

export interface PremiumService {
  getEntitlement(): Promise<EntitlementState>;
  subscribe(listener: (state: EntitlementState) => void): () => void;
  getOffering(): Promise<KinPlusOffering | null>;
  purchase(packageId: string): Promise<EntitlementState>;
  restore(): Promise<EntitlementState>;
}
