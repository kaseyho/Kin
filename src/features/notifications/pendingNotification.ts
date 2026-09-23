import type { StorageAdapter } from '@/data/contracts';

const PENDING_NOTIFICATION_KEY = 'kin.pending-notification.v1';
const SAFE_SPACE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export interface PendingNotificationDestination {
  path: `/space/${string}`;
  spaceId: string;
}

interface PersistedPendingNotification extends PendingNotificationDestination {
  version: 1;
}

export function parseNotificationDestination(
  value: unknown,
): PendingNotificationDestination | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { path?: unknown; spaceId?: unknown };
  if (typeof candidate.spaceId !== 'string' || !SAFE_SPACE_ID.test(candidate.spaceId)) return null;
  const path = `/space/${candidate.spaceId}` as const;
  if (candidate.path !== path) return null;
  return { path, spaceId: candidate.spaceId };
}

export async function savePendingNotification(
  storage: StorageAdapter,
  value: unknown,
): Promise<PendingNotificationDestination> {
  const destination = parseNotificationDestination(value);
  if (!destination) throw new Error('Kin received an invalid notification destination.');
  const pending: PersistedPendingNotification = { ...destination, version: 1 };
  await storage.setItem(PENDING_NOTIFICATION_KEY, JSON.stringify(pending));
  return destination;
}

export async function readPendingNotification(
  storage: StorageAdapter,
): Promise<PendingNotificationDestination | null> {
  let stored: string | null;
  try {
    stored = await storage.getItem(PENDING_NOTIFICATION_KEY);
  } catch {
    return null;
  }
  if (stored === null) return null;

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!isPersistedPendingNotification(parsed)) throw new Error('invalid pending notification');
    const destination = parseNotificationDestination(parsed);
    if (!destination) throw new Error('invalid notification destination');
    return destination;
  } catch {
    try {
      await storage.removeItem(PENDING_NOTIFICATION_KEY);
    } catch {
      // A broken storage layer must not prevent auth or the chat list from opening.
    }
    return null;
  }
}

export function clearPendingNotification(storage: StorageAdapter): Promise<void> {
  return storage.removeItem(PENDING_NOTIFICATION_KEY);
}

function isPersistedPendingNotification(value: unknown): value is PersistedPendingNotification {
  if (!value || typeof value !== 'object') return false;
  const pending = value as Partial<PersistedPendingNotification>;
  return pending.version === 1;
}
