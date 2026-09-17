import { createContext, type PropsWithChildren, useEffect, useMemo, useRef, useState } from 'react';

import type { ConnectivityService, NetworkStatus } from '@/services/connectivity/contracts';
import { createNetInfoConnectivityService } from '@/services/connectivity/netinfo';

export type ConnectivityPhase = NetworkStatus | 'restored';

export const ConnectivityContext = createContext<{ phase: ConnectivityPhase }>({ phase: 'online' });
const defaultConnectivityService = createNetInfoConnectivityService();

export function ConnectivityProvider({
  children,
  service = defaultConnectivityService,
}: PropsWithChildren<{ service?: ConnectivityService }>) {
  const [phase, setPhase] = useState<ConnectivityPhase>('reconnecting');
  const previousStatus = useRef<NetworkStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    let restoredTimer: ReturnType<typeof setTimeout> | undefined;
    const applyStatus = (status: NetworkStatus) => {
      if (!mounted) return;
      if (restoredTimer) clearTimeout(restoredTimer);
      const restored = status === 'online'
        && previousStatus.current !== null
        && previousStatus.current !== 'online';
      previousStatus.current = status;
      setPhase(restored ? 'restored' : status);
      if (restored) {
        restoredTimer = setTimeout(() => {
          if (mounted) setPhase('online');
        }, 2500);
      }
    };
    void service.getCurrentStatus().then(applyStatus).catch(() => applyStatus('reconnecting'));
    const unsubscribe = service.subscribe(applyStatus);
    return () => {
      mounted = false;
      if (restoredTimer) clearTimeout(restoredTimer);
      unsubscribe();
    };
  }, [service]);

  const value = useMemo(() => ({ phase }), [phase]);
  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}
