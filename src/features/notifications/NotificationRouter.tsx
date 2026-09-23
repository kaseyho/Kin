import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import type { StorageAdapter } from '@/data/contracts';
import type { KinSnapshot } from '@/domain/models';
import type {
  NotificationResponseHandoff,
  NotificationService,
} from '@/services/notifications/contracts';
import { useAuth } from '@/state/useAuth';
import { useKin } from '@/state/useKin';
import {
  clearPendingNotification,
  parseNotificationDestination,
  readPendingNotification,
  savePendingNotification,
  type PendingNotificationDestination,
} from './pendingNotification';

interface NotificationRouterProps {
  service: NotificationService;
  storage: StorageAdapter;
}

export function NotificationRouter({ service, storage }: NotificationRouterProps) {
  const auth = useAuth();
  const kin = useKin();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [invalidTarget, setInvalidTarget] = useState(false);
  const [pending, setPending] = useState<PendingNotificationDestination | null>(null);
  const [cleanupRetryRevision, setCleanupRetryRevision] = useState(0);
  const cleanupRetryDelay = useRef(250);
  const cleanupRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledResponseIds = useRef(new Set<string>());
  const mounted = useRef(true);
  const routing = useRef(false);
  const routingOperation = useRef(0);

  useEffect(() => {
    let active = true;
    let queue = Promise.resolve();

    const clearNativeResponse = async () => {
      try {
        await service.clearLastResponse();
      } catch {
        // The minimized local handoff remains sufficient if native cleanup is unavailable.
      }
    };

    const capture = async (response: NotificationResponseHandoff) => {
      if (handledResponseIds.current.has(response.id)) {
        await clearNativeResponse();
        return;
      }
      const destination = parseNotificationDestination(response.data);
      if (!destination) {
        handledResponseIds.current.add(response.id);
        try {
          await clearPendingNotification(storage);
        } catch {
          // Navigation recovery must remain available when local storage is degraded.
        }
        await clearNativeResponse();
        if (active) {
          setPending(null);
          setInvalidTarget(true);
        }
        return;
      }

      try {
        const saved = await savePendingNotification(storage, destination);
        handledResponseIds.current.add(response.id);
        await clearNativeResponse();
        if (active) {
          setInvalidTarget(false);
          setPending(saved);
        }
      } catch {
        // Keep the native response intact so a later launch can retry a failed persistence handoff.
      }
    };

    const enqueue = (operation: () => Promise<void>) => {
      queue = queue.then(operation).catch(() => undefined);
    };

    let unsubscribe: () => void = () => undefined;
    try {
      unsubscribe = service.subscribeToResponses((response) => {
        enqueue(() => capture(response));
      });
    } catch {
      // Unsupported platforms expose a no-op service; routing remains dormant there.
    }

    enqueue(async () => {
      try {
        const stored = await readPendingNotification(storage);
        if (active) setPending(stored);
        const response = await service.getLastResponse();
        if (response) await capture(response);
      } finally {
        if (active) setHydrated(true);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [service, storage]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      routingOperation.current += 1;
      routing.current = false;
      if (cleanupRetryTimer.current) clearTimeout(cleanupRetryTimer.current);
    };
  }, []);

  useEffect(() => {
    const authenticated = auth.state.status === 'signed-in' || auth.state.status === 'demo';
    if (!hydrated || !authenticated || kin.status !== 'ready' || routing.current) return;
    if (!invalidTarget && !pending) return;

    const expectedUserId = auth.state.status === 'signed-in'
      ? auth.state.user.id
      : kin.snapshot?.currentUserId ?? null;
    const destinationAvailable = pending
      ? isActiveMemberDestination(pending, kin.snapshot, expectedUserId)
      : false;
    routing.current = true;
    const operation = routingOperation.current + 1;
    routingOperation.current = operation;

    void (async () => {
      try {
        await clearPendingNotification(storage);
      } catch {
        if (!mounted.current || routingOperation.current !== operation) return;
        routing.current = false;
        if (!cleanupRetryTimer.current) {
          const delay = cleanupRetryDelay.current;
          cleanupRetryDelay.current = Math.min(delay * 2, 30_000);
          cleanupRetryTimer.current = setTimeout(() => {
            cleanupRetryTimer.current = null;
            setCleanupRetryRevision((revision) => revision + 1);
          }, delay);
        }
        return;
      }
      if (!mounted.current || routingOperation.current !== operation) return;
      cleanupRetryDelay.current = 250;
      if (cleanupRetryTimer.current) {
        clearTimeout(cleanupRetryTimer.current);
        cleanupRetryTimer.current = null;
      }
      setPending(null);
      setInvalidTarget(false);
      if (destinationAvailable && pending) {
        router.replace({
          pathname: '/space/[spaceId]',
          params: { spaceId: pending.spaceId },
        });
      } else {
        router.replace({
          pathname: '/(tabs)/chats',
          params: { notice: 'notification-unavailable' },
        });
      }
      routing.current = false;
    })();
    return () => {
      if (routingOperation.current === operation) {
        routingOperation.current += 1;
        routing.current = false;
      }
    };
  }, [
    auth.state,
    cleanupRetryRevision,
    hydrated,
    invalidTarget,
    kin.snapshot,
    kin.status,
    pending,
    router,
    storage,
  ]);

  return null;
}

export function NotificationSignOutCleaner({ service, storage }: NotificationRouterProps) {
  const auth = useAuth();
  const previousAuthStatus = useRef(auth.state.status);

  useEffect(() => {
    const previous = previousAuthStatus.current;
    const current = auth.state.status;
    previousAuthStatus.current = current;
    if ((previous === 'demo' || previous === 'signed-in') && current === 'signed-out') {
      void Promise.allSettled([
        clearPendingNotification(storage),
        service.clearLastResponse(),
      ]);
    }
  }, [auth.state.status, service, storage]);

  return null;
}

function isActiveMemberDestination(
  destination: PendingNotificationDestination,
  snapshot: KinSnapshot | null,
  expectedUserId: string | null,
): boolean {
  if (!snapshot || !expectedUserId || snapshot.currentUserId !== expectedUserId) return false;
  return snapshot.spaces.some((space) => space.id === destination.spaceId)
    && snapshot.members.some((member) => (
      member.spaceId === destination.spaceId && member.userId === expectedUserId
    ));
}
