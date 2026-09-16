import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { AuthService, AuthState } from '@/services/auth/contracts';

export interface AuthContextValue {
  state: AuthState;
  requestOtp: AuthService['requestOtp'];
  verifyOtp: AuthService['verifyOtp'];
  signOut: AuthService['signOut'];
}

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps extends PropsWithChildren {
  service: AuthService;
}

export function AuthProvider({ children, service }: AuthProviderProps) {
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
  const verifyOtp = useCallback<AuthService['verifyOtp']>(
    (email, token) => service.verifyOtp(email, token),
    [service],
  );
  const signOut = useCallback<AuthService['signOut']>(() => service.signOut(), [service]);

  const value = useMemo<AuthContextValue>(
    () => ({ requestOtp, signOut, state, verifyOtp }),
    [requestOtp, signOut, state, verifyOtp],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
