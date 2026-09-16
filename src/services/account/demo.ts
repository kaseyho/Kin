import { AccountError, type AccountService } from './contracts';

export function createDemoAccountService(): AccountService {
  const unavailable = async (): Promise<never> => {
    throw new AccountError('unavailable', 'Account controls are unavailable in the Kin demo.');
  };
  return {
    deleteAccount: unavailable,
    exportData: unavailable,
    requestFreshOtp: unavailable,
    verifyFreshOtp: unavailable,
  };
}
