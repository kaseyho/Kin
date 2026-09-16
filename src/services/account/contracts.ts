export type AccountErrorCode =
  | 'reauth_required'
  | 'export_failed'
  | 'deletion_failed'
  | 'unavailable';

export class AccountError extends Error {
  constructor(readonly code: AccountErrorCode, message: string) {
    super(message);
    this.name = 'AccountError';
  }
}

export interface AccountExport {
  version: 1;
  exportedAt: string;
  profile: unknown | null;
  memberships?: unknown[];
  preferences?: unknown[];
  messages?: unknown[];
  reactions?: unknown[];
  memories?: unknown[];
  invites?: unknown[];
  sourceLinks?: unknown[];
}

export interface AccountService {
  requestFreshOtp(email: string): Promise<void>;
  verifyFreshOtp(email: string, token: string): Promise<void>;
  exportData(): Promise<AccountExport>;
  deleteAccount(): Promise<{ deleted: true }>;
}
