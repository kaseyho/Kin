import type { StorageAdapter } from '@/data/contracts';

import { normalizeInviteCode } from './inviteLinks';

const PENDING_INVITE_KEY = 'kin.pending-invite.v1';

interface PersistedPendingInvite {
  version: 1;
  code: string;
}

export async function savePendingInvite(
  storage: StorageAdapter,
  value: string,
): Promise<string> {
  const code = normalizeInviteCode(value);
  if (!code) throw new Error('Kin received an invalid invitation code.');
  const pending: PersistedPendingInvite = { version: 1, code };
  await storage.setItem(PENDING_INVITE_KEY, JSON.stringify(pending));
  return code;
}

export async function readPendingInvite(storage: StorageAdapter): Promise<string | null> {
  let stored: string | null;
  try {
    stored = await storage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
  if (stored === null) return null;

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!isPendingInvite(parsed)) throw new Error('invalid pending invitation');
    const code = normalizeInviteCode(parsed.code);
    if (!code) throw new Error('invalid invitation code');
    return code;
  } catch {
    try {
      await storage.removeItem(PENDING_INVITE_KEY);
    } catch {
      // A broken storage layer must not prevent auth or onboarding from continuing.
    }
    return null;
  }
}

export function clearPendingInvite(storage: StorageAdapter): Promise<void> {
  return storage.removeItem(PENDING_INVITE_KEY);
}

function isPendingInvite(value: unknown): value is PersistedPendingInvite {
  if (!value || typeof value !== 'object') return false;
  const pending = value as Partial<PersistedPendingInvite>;
  return pending.version === 1 && typeof pending.code === 'string';
}
