import { AuthError, type AuthService } from './contracts';

const DEMO_ACTION_ERROR = 'This action is unavailable in the Kin demo.';

export function createDemoAuthService(): AuthService {
  const unavailable = async (): Promise<never> => {
    throw new AuthError('unavailable', DEMO_ACTION_ERROR);
  };

  return {
    load: async () => ({ status: 'demo' }),
    subscribe: () => () => undefined,
    requestOtp: unavailable,
    verifyOtp: unavailable,
    signOut: unavailable,
  };
}
