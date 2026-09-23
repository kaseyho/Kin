import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';

import type { NotificationService, NotificationState } from '@/services/notifications/contracts';

export interface NotificationContextValue {
  busy: boolean;
  error: string;
  state: NotificationState;
  deactivateCurrentInstallation(): Promise<void>;
  openSettings(): Promise<void>;
  refresh(): Promise<void>;
  requestPermissionAndRegister(): Promise<void>;
  setCurrentDeviceEnabled(enabled: boolean): Promise<void>;
  setPreviewsEnabled(enabled: boolean): Promise<void>;
}

const unavailableState: NotificationState = {
  deviceEnabled: false,
  installationRegistered: false,
  message: 'Push notifications are unavailable in this build.',
  previewsEnabled: true,
  status: 'unavailable',
};

const fallback: NotificationContextValue = {
  busy: false,
  deactivateCurrentInstallation: async () => undefined,
  error: '',
  openSettings: async () => undefined,
  refresh: async () => undefined,
  requestPermissionAndRegister: async () => undefined,
  setCurrentDeviceEnabled: async () => undefined,
  setPreviewsEnabled: async () => undefined,
  state: unavailableState,
};

export const NotificationContext = createContext<NotificationContextValue>(fallback);

export function NotificationProvider({
  active,
  children,
  service,
}: PropsWithChildren<{ active: boolean; service: NotificationService }>) {
  const [state, setState] = useState<NotificationState>({
    ...unavailableState,
    status: active ? 'loading' : 'unavailable',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = useCallback(async (operation: () => Promise<NotificationState>) => {
    setBusy(true);
    setError('');
    try {
      setState(await operation());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Kin could not update notifications.');
    } finally {
      setBusy(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await run(() => service.load());
  }, [run, service]);

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    void service.load()
      .then((nextState) => {
        if (mounted) setState(nextState);
      })
      .catch((reason: unknown) => {
        if (mounted) {
          setError(reason instanceof Error ? reason.message : 'Kin could not load notifications.');
        }
      });
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void refresh();
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [active, refresh, service]);

  const value = useMemo<NotificationContextValue>(() => ({
    busy,
    deactivateCurrentInstallation: async () => {
      setError('');
      try {
        await service.deactivateCurrentInstallation();
        setState((current) => ({ ...current, installationRegistered: false }));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Kin could not remove this device.');
      }
    },
    error,
    openSettings: () => service.openSettings(),
    refresh,
    requestPermissionAndRegister: () => run(() => service.requestPermissionAndRegister()),
    setCurrentDeviceEnabled: (enabled) => run(() => service.setCurrentDeviceEnabled(enabled)),
    setPreviewsEnabled: (enabled) => run(() => service.setPreviewsEnabled(enabled)),
    state,
  }), [busy, error, refresh, run, service, state]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
