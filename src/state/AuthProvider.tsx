import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { AuthService, AuthState } from '@/services/auth/contracts';
import type { AccountService } from '@/services/account/contracts';

export interface AuthContextValue {
  accountService: AccountService;
  state: AuthState;
  requestOtp: AuthService['requestOtp'];
  verifyOtp: AuthService['verifyOtp'];
  signOut: AuthService['signOut'];
}

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps extends PropsWithChildren {
  accountService: AccountService;
  service: AuthService;
}

export function AuthProvider({ accountService, children, service }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    let authEventRevision = 0;

    const unsubscribe = service.subscribe((nextState) => {
      authEventRevision += 1;
      if (active) setState(nextState);
    });
    const loadRevision = authEventRevision;

    void service
      .load()
      .then((loadedState) => {
        if (active && authEventRevision === loadRevision) setState(loadedState);
      })
      .catch(() => {
        if (active && authEventRevision === loadRevision) setState({ status: 'signed-out' });
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [service]);

  const requestOtp = useCallback<AuthService['requestOtp']>(
    (email) => service.requestOtp(email),
    [service],
  );
  const verifyOtp = useCallback<AuthService['verifyOtp']>(async (email, token) => {
    const user = await service.verifyOtp(email, token);
    setState({ status: 'signed-in', user });
    return user;
  }, [service]);
  const signOut = useCallback<AuthService['signOut']>(async () => {
    await service.signOut();
    setState({ status: 'signed-out' });
  }, [service]);

  const value = useMemo<AuthContextValue>(
    () => ({ accountService, requestOtp, signOut, state, verifyOtp }),
    [accountService, requestOtp, signOut, state, verifyOtp],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
